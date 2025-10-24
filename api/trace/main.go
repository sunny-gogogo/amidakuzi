package main

import (
    "encoding/json"
    "net/http"
    "sort"

    "github.com/sunny-gogogo/amidakuzi/lib/amida"
)

type TraceRequest struct {
    N      int          `json:"n"`
    Levels int          `json:"levels"`
    Rungs  []amida.Rung `json:"rungs"`
    Start  int          `json:"start"`
}

type Point struct {
    X float64 `json:"x"`
    Y float64 `json:"y"`
}

type TraceResponse struct {
    EndIndex int     `json:"endIndex"`
    Path     []Point `json:"path"`
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

    sort.Slice(req.Rungs, func(i, j int) bool {
        if req.Rungs[i].Y == req.Rungs[j].Y {
            return req.Rungs[i].Left < req.Rungs[j].Left
        }
        return req.Rungs[i].Y < req.Rungs[j].Y
    })

    pos := req.Start
    path := make([]Point, 0, len(req.Rungs)*2+4)
    path = append(path, Point{X: float64(pos), Y: 0})

    curY := 0
    for _, rung := range req.Rungs {
        if rung.Y > curY {
            path = append(path, Point{X: float64(pos), Y: float64(rung.Y)})
            curY = rung.Y
        }
        if rung.Left == pos {
            path = append(path, Point{X: float64(pos+1), Y: float64(curY)})
            pos = pos + 1
        } else if rung.Left == pos-1 {
            path = append(path, Point{X: float64(pos-1), Y: float64(curY)})
            pos = pos - 1
        }
    }

    if curY < req.Levels {
        path = append(path, Point{X: float64(pos), Y: float64(req.Levels)})
    }

    res := TraceResponse{EndIndex: pos, Path: path}
    w.Header().Set("Content-Type", "application/json; charset=utf-8")
    json.NewEncoder(w).Encode(res)
}
