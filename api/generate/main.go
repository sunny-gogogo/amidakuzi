package handler

import (
	"encoding/json"
	"errors"
	"math/rand"
	"net/http"
	"time"

	"github.com/sunny-gogogo/amidakuzi/lib/amida"
)

type Ladder struct {
	N      int          `json:"n"`
	Levels int          `json:"levels"`
	Rungs  []amida.Rung `json:"rungs"`
	Top    []string     `json:"top"`
	Bottom []string     `json:"bottom"`
}

type GenerateRequest struct {
	N            int      `json:"n"`
	Bottom       []string `json:"bottom"`
	Levels       int      `json:"levels"`
	RungDensity  float64  `json:"rungDensity"`
	Seed         *int64   `json:"seed"`
	DefaultAtari bool     `json:"defaultAtari"`
}

type GenerateResponse struct {
	Ladder Ladder `json:"ladder"`
}

// バランス調整用
const targetRungsPerPair = 3.0 // 各ペアの目標本数
const minAutoDensity = 0.05
const maxAutoDensity = 0.60
const minRungsPerPair = 2 // 各ペアの最低本数保証

func validateGenerate(req *GenerateRequest) error {
	if req.N < 2 || req.N > 50 {
		return errors.New("n must be between 2 and 50")
	}
	if req.Levels <= 0 {
		req.Levels = req.N * 3
	}
	// 自動密度調整
	if req.RungDensity <= 0 {
		p := targetRungsPerPair / float64(req.Levels)
		if p < minAutoDensity {
			p = minAutoDensity
		}
		if p > maxAutoDensity {
			p = maxAutoDensity
		}
		req.RungDensity = p
	}
	if req.RungDensity > 0.95 {
		req.RungDensity = 0.95
	}
	return nil
}

// デフォルトの「あたり」「はずれ」
func generateDefaultBottom(n int) []string {
	out := make([]string, n)
	if n > 0 {
		out[0] = "あたり"
		for i := 1; i < n; i++ {
			out[i] = "はずれ"
		}
	}
	return out
}

// 横線を構築する
func buildRungs(n, levels int, p float64, r *rand.Rand) []amida.Rung {
	rungs := make([]amida.Rung, 0, int(float64(levels)*p))
	for y := 0; y < levels; y++ {
		skipped := false
		for left := 0; left < n-1; left++ {
			if skipped {
				skipped = false
				continue
			}
			if r.Float64() < p {
				rungs = append(rungs, amida.Rung{Left: left, Y: y})
				skipped = true // 同じ段で隣接禁止
			}
		}
	}

	// ★ 各ペアに最低2本保証
	pairCount := make([]int, n-1)
	for _, rung := range rungs {
		pairCount[rung.Left]++
	}

	for left := 0; left < n-1; left++ {
		if pairCount[left] < minRungsPerPair {
			need := minRungsPerPair - pairCount[left]
			for i := 0; i < need; i++ {
				y := r.Intn(levels)
				// すでに同じYにあるならやり直す
				for hasRungAt(rungs, left, y) {
					y = r.Intn(levels)
				}
				rungs = append(rungs, amida.Rung{Left: left, Y: y})
			}
		}
	}

	return rungs
}

// 同じ位置に横線があるか確認
func hasRungAt(rungs []amida.Rung, left, y int) bool {
	for _, rung := range rungs {
		if rung.Left == left && rung.Y == y {
			return true
		}
	}
	return false
}

func shuffle[T any](s []T, r *rand.Rand) {
	for i := len(s) - 1; i > 0; i-- {
		j := r.Intn(i + 1)
		s[i], s[j] = s[j], s[i]
	}
}

// エントリーポイント
func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req GenerateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if err := validateGenerate(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var rng *rand.Rand
	if req.Seed != nil {
		rng = rand.New(rand.NewSource(*req.Seed))
	} else {
		rng = rand.New(rand.NewSource(time.Now().UnixNano()))
	}

	bottom := req.Bottom
	if len(bottom) == 0 {
		if req.DefaultAtari {
			bottom = generateDefaultBottom(req.N)
		}
	}
	if len(bottom) != req.N {
		tmp := make([]string, req.N)
		copy(tmp, bottom)
		for i := len(bottom); i < req.N; i++ {
			tmp[i] = "はずれ"
		}
		bottom = tmp
	}

	top := make([]string, req.N)
	rungs := buildRungs(req.N, req.Levels, req.RungDensity, rng)

	res := GenerateResponse{
		Ladder: Ladder{
			N:      req.N,
			Levels: req.Levels,
			Rungs:  rungs,
			Top:    top,
			Bottom: bottom,
		},
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(res)
}
