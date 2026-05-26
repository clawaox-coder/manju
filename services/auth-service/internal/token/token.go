// Package token 处理 RS256 JWT 签发 + 校验, 与 security.md §2 + api.md §7.1 对齐.

package token

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/manju-org/manju/services/auth-service/internal/apperr"
)

type Claims struct {
	TeamID string `json:"team_id"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

type Signer struct {
	priv   *rsa.PrivateKey
	pub    *rsa.PublicKey
	issuer string
	accTTL time.Duration
}

func LoadSigner(privPath, pubPath, issuer string, accessTTL time.Duration) (*Signer, error) {
	priv, err := loadRSAPrivate(privPath)
	if err != nil {
		return nil, fmt.Errorf("load private key: %w", err)
	}
	pub, err := loadRSAPublic(pubPath)
	if err != nil {
		return nil, fmt.Errorf("load public key: %w", err)
	}
	return NewSigner(priv, pub, issuer, accessTTL), nil
}

// NewSigner 给已有 RSA 密钥对包一层 (测试常用).
func NewSigner(priv *rsa.PrivateKey, pub *rsa.PublicKey, issuer string, accessTTL time.Duration) *Signer {
	return &Signer{priv: priv, pub: pub, issuer: issuer, accTTL: accessTTL}
}

// NewAccessToken 颁发 access token (sub=userID, team_id, role, jti).
func (s *Signer) NewAccessToken(userID, teamID uuid.UUID, role string) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(s.accTTL)
	claims := &Claims{
		TeamID: teamID.String(),
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
			ID:        uuid.NewString(),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := t.SignedString(s.priv)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, exp, nil
}

// Verify 校验 access token 签名 + 过期. 返回 claims.
func (s *Signer) Verify(raw string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.pub, nil
	})
	if err != nil {
		return nil, apperr.InvalidToken("token 无效或已过期").WithCause(err)
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, apperr.InvalidToken("token 校验失败")
	}
	return claims, nil
}

// NewRefreshOpaque 返回 32 字节随机 + 其 sha256 hex hash (存表/缓存).
func NewRefreshOpaque() (token, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	hash = HashRefresh(token)
	return token, hash, nil
}

func HashRefresh(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// ---- key loading ----

func loadRSAPrivate(path string) (*rsa.PrivateKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, errors.New("no PEM block found")
	}
	if k, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return k, nil
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	k, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("not an RSA private key")
	}
	return k, nil
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
