package handler

type Rung struct {
	Left int `json:"left"` // 0..n-2 のいずれか。left と left+1 を繋ぐ
	Y    int `json:"y"`    // 0..levels-1
}
