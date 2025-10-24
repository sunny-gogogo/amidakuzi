package handler

import (
	"encoding/json"
	"net/http"
	"sort"
)

type TraceRequest struct {
	N      int    `json:"n"`
	Levels int    `json:"levels"`
	Rungs  []Rung `json:"rungs"`
	Start  int    `json:"start"` // 上からの開始列 index（0..n-1）
}

type Point struct {
	X float64 `json:"x"` // 0..(n-1) の列位置（Canvas 用にそのままスケールしやすいよう double）
	Y float64 `json:"y"` // 0..levels の段位置（上=0、下=levels）
}

type TraceResponse struct {
	EndIndex int     `json:"endIndex"`
	Path     []Point `json:"path"` // 描画用ポリライン（縦・横の折れ線）
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req TraceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.N < 2 || req.Start < 0 || req.Start >= req.N || req.Levels <= 0 {
		http.Error(w, "invalid parameters", http.StatusBadRequest)
		return
	}

	// y 昇順に横線を処理
	sort.Slice(req.Rungs, func(i, j int) bool {
		if req.Rungs[i].Y == req.Rungs[j].Y {
			return req.Rungs[i].Left < req.Rungs[j].Left
		}
		return req.Rungs[i].Y < req.Rungs[j].Y
	})

	pos := req.Start
	path := make([]Point, 0, len(req.Rungs)*2+4)
	// 開始点（上端）
	path = append(path, Point{X: float64(pos), Y: 0})

	curY := 0
	for _, rung := range req.Rungs {
		// 現在位置の縦線を rung.Y まで下げる
		if rung.Y > curY {
			path = append(path, Point{X: float64(pos), Y: float64(rung.Y)})
			curY = rung.Y
		}
		// rung で左右に移動するか？
		if rung.Left == pos {
			// 右へ
			path = append(path, Point{X: float64(pos+1), Y: float64(curY)})
			pos = pos + 1
		} else if rung.Left == pos-1 {
			// 左へ
			path = append(path, Point{X: float64(pos-1), Y: float64(curY)})
			pos = pos - 1
		}
		// 次の段へ下げ始める準備（同じ段に複数 rung があっても描画的にはこのままOK）
	}

	// 残りを最下部まで
	if curY < req.Levels {
		path = append(path, Point{X: float64(pos), Y: float64(req.Levels)})
	}

	res := TraceResponse{
		EndIndex: pos,
		Path:     path,
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(res)
}
