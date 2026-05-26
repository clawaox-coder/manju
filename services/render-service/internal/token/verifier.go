// Package token 只做 RS256 access token 的校验 (render-service 不签发 token).

package token

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"os"

	"github.com/golang-jwt/jwt/v5"

	"github.com/manju-org/manju/services/render-service/internal/apperr"
)

type Claims struct {
	TeamID string `json:"team_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

type Verifier struct {
	pub    *rsa.PublicKey
	issuer string
}

func LoadVerifier(pubPath, issuer string) (*Verifier, error) {
	pub, err := loadRSAPublic(pubPath)
	if err != nil {
		return nil, err
	}
	return &Verifier{pub: pub, issuer: issuer}, nil
}

func NewVerifier(pub *rsa.PublicKey, issuer string) *Verifier {
	return &Verifier{pub: pub, issuer: issuer}
}

func (v *Verifier) Verify(raw string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return v.pub, nil
	})
	if err != nil {
		return nil, apperr.InvalidToken("token 无效或已过期").WithCause(err)
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, apperr.InvalidToken("token 校验失败")
	}
	if v.issuer != "" && claims.Issuer != v.issuer {
		return nil, apperr.InvalidToken("token issuer 不匹配")
	}
	return claims, nil
}

func loadRSAPublic(path string) (*rsa.PublicKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, errors.New("no PEM block found")
	}
	if k, err := x509.ParsePKCS1PublicKey(block.Bytes); err == nil {
		return k, nil
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	k, ok := parsed.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("not an RSA public key")
	}
	return k, nil
}
