package handler

import (
	"encoding/json"
	"errors"
	"math/rand"
	"net/http"
	"time"
)

type Ladder struct {
	N      int      `json:"n"`
	Levels int      `json:"levels"`
	Rungs  []Rung   `json:"rungs"`
	Top    []string `json:"top"`
	Bottom []string `json:"bottom"`
}

// ---------- リクエスト/レスポンス ----------
type GenerateRequest struct {
	N            int      `json:"n"`             // 縦線本数（2..20 推奨）
	Bottom       []string `json:"bottom"`        // 下項目（未指定ならデフォルト生成）
	Levels       int      `json:"levels"`        // 段数（未指定なら n*3）
	RungDensity  float64  `json:"rungDensity"`   // 0..1（1 に近いほど横線多め）。未指定なら 0.55
	Seed         *int64   `json:"seed"`          // 乱数シード（再現性が必要なら指定）
	DefaultAtari bool     `json:"defaultAtari"`  // true なら「当たり1つ＋残りはずれ」を自動
}

type GenerateResponse struct {
	Ladder Ladder `json:"ladder"`
}

func validateGenerate(req *GenerateRequest) error {
	if req.N < 2 || req.N > 50 {
		return errors.New("n must be between 2 and 50")
	}
	if req.Levels <= 0 {
		req.Levels = req.N * 3
	}
	if req.RungDensity <= 0 {
		req.RungDensity = 0.55
	}
	if req.RungDensity > 0.95 {
		req.RungDensity = 0.95
	}
	return nil
}

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

// 横線を生成：各段 y ごとに、隣接しないように left をランダム配置
func buildRungs(n, levels int, p float64, r *rand.Rand) []Rung {
	rungs := make([]Rung, 0, int(float64(levels)*p))
	for y := 0; y < levels; y++ {
		// 一段の中で左右に被らないように走査
        // 0..n-2 の位置に対して確率 p で横線を置く。ただし直前に置いたらスキップ
		skipped := false
		for left := 0; left < n-1; left++ {
			if skipped {
				skipped = false
				continue
			}
			if r.Float64() < p {
				rungs = append(rungs, Rung{Left: left, Y: y})
				// 隣接の衝突回避（left+1 はスキップ）
				skipped = true
			}
		}
	}
	return rungs
}

func shuffle[T any](s []T, r *rand.Rand) {
	for i := len(s) - 1; i > 0; i-- {
		j := r.Intn(i + 1)
		s[i], s[j] = s[j], s[i]
	}
}

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

	// 下ラベル
	bottom := req.Bottom
	if len(bottom) == 0 {
		if req.DefaultAtari || true {
			bottom = generateDefaultBottom(req.N)
		}
	}
	if len(bottom) != req.N {
		// 足りなければ穴埋め
		tmp := make([]string, req.N)
		copy(tmp, bottom)
		for i := len(bottom); i < req.N; i++ {
			tmp[i] = "はずれ"
		}
		bottom = tmp
	}

	// 上ラベルは空（フロントで編集予定）
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
	json.NewEncoder(w).Encode(res)
}
