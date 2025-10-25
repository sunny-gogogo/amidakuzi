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

// バランス・制約
const (
	targetRungsPerPair = 4.0 // 各ペアの目標本数（体感 3〜5 の中間）
	minAutoDensity     = 0.05
	maxAutoDensity     = 0.60
	minRungsPerPair    = 2   // 各ペアの最低本数保証
	MIN_START_GAP_LEVELS = 1 // ★ 開始点から最低この段数は横線を置かない（y >= 1 にする）
)

func validateGenerate(req *GenerateRequest) error {
	if req.N < 2 || req.N > 50 {
		return errors.New("n must be between 2 and 50")
	}
	// 段数が小さすぎると開始ギャップを確保できないので補正
	minLevels := 1 + MIN_START_GAP_LEVELS // 例: gap=1 → levels >= 2 が必要
	if req.Levels <= 0 {
		req.Levels = req.N * 3
	}
	if req.Levels < minLevels {
		req.Levels = minLevels
	}

	// 自動密度調整（rungDensity 未指定・0以下なら補完）
	if req.RungDensity <= 0 {
		// 1ペアあたりの期待本数 ≈ 有効段数 * p
		// ※ 有効段数 = levels - MIN_START_GAP_LEVELS （横線を置ける段の数）
		effectiveLevels := float64(req.Levels - MIN_START_GAP_LEVELS)
		if effectiveLevels < 1 {
			effectiveLevels = 1 // 念のため
		}
		p := targetRungsPerPair / effectiveLevels
		if p < minAutoDensity {
			p = minAutoDensity
		}
		if p > maxAutoDensity {
			p = maxAutoDensity
		}
		req.RungDensity = p
	}
	// 念のための上限
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

// 既存横線をインデックス化（y -> set(left)）
func indexRungs(rungs []amida.Rung) map[int]map[int]bool {
	m := make(map[int]map[int]bool, len(rungs))
	for _, rg := range rungs {
		if _, ok := m[rg.Y]; !ok {
			m[rg.Y] = make(map[int]bool)
		}
		m[rg.Y][rg.Left] = true
	}
	return m
}

// 同一段での隣接禁止 + 重複禁止 + 開始ギャップを満たすか
func canPlace(left, y, n int, idx map[int]map[int]bool) bool {
	// 開始点と同じ高さ（およびそれ未満）は置かない
	if y < MIN_START_GAP_LEVELS {
		return false
	}
	row := idx[y]
	if row == nil {
		return true // その段にまだ何もなければOK
	}
	// 同じペア同じ段はNG
	if row[left] {
		return false
	}
	// 同一段での隣接禁止（左右のペア）
	if left-1 >= 0 && row[left-1] {
		return false
	}
	if left+1 <= n-2 && row[left+1] {
		return false
	}
	return true
}

// 横線を構築する
func buildRungs(n, levels int, p float64, r *rand.Rand) []amida.Rung {
	// まず確率的に生成（同一段の隣接禁止は既存ロジックで担保）
	rungs := make([]amida.Rung, 0, int(float64(levels)*p))
	for y := MIN_START_GAP_LEVELS; y < levels; y++ { // ★ y は 1 から開始
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

	// 既存をインデックス化
	idx := indexRungs(rungs)

	// 各ペアの本数をカウント
	pairCount := make([]int, n-1)
	for _, rg := range rungs {
		pairCount[rg.Left]++
	}

	// ★ 各ペアに最低2本を保証（同一段の隣接禁止 + 開始ギャップ厳守）
	for left := 0; left < n-1; left++ {
		if pairCount[left] >= minRungsPerPair {
			continue
		}
		need := minRungsPerPair - pairCount[left]

		for i := 0; i < need; i++ {
			// まずランダム試行
			placed := false
			for tries := 0; tries < 2*levels; tries++ {
				y := MIN_START_GAP_LEVELS + r.Intn(levels-MIN_START_GAP_LEVELS)
				if canPlace(left, y, n, idx) {
					rungs = append(rungs, amida.Rung{Left: left, Y: y})
					if idx[y] == nil {
						idx[y] = make(map[int]bool)
					}
					idx[y][left] = true
					pairCount[left]++
					placed = true
					break
				}
			}
			// ランダムで見つからなければ、全段走査で必ず探す
			if !placed {
				for y := MIN_START_GAP_LEVELS; y < levels; y++ {
					if canPlace(left, y, n, idx) {
						rungs = append(rungs, amida.Rung{Left: left, Y: y})
						if idx[y] == nil {
							idx[y] = make(map[int]bool)
						}
						idx[y][left] = true
						pairCount[left]++
						placed = true
						break
					}
				}
			}
			// levels が極端に小さいと置けない可能性は理論上あるが、
			// デフォルト levels = n*3 なら実用上は必ず見つかる。
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

// ★ Vercel が呼ぶエクスポート関数
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

	w.Header().Set("Content-Type": "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(res)
}
