package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// Encrypt encrypts plainText using AES-256-GCM with the provided hexKey.
// Output format: hex(IV):hex(AuthTag):hex(Ciphertext)
func Encrypt(plainText string, hexKey string) (string, error) {
	if plainText == "" {
		return "", nil
	}

	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return "", fmt.Errorf("invalid key hex: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// IV 12 bytes
	iv := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return "", err
	}

	// Seal appends the result to the slice provided as the first argument.
	// The result is AuthTag + Ciphertext (or Ciphertext + AuthTag depending on implementation?)
	// Go's GCM Seal: ciphertext = Seal(dst, nonce, plaintext, additionalData)
	// It appends ciphertext AND tag to dst. The tag is at the END.
	ciphertextAndTag := aesGCM.Seal(nil, iv, []byte(plainText), nil)

	// Extract Tag and Ciphertext
	// Tag size is usually 16 bytes for AES-GCM
	tagSize := aesGCM.Overhead()
	if len(ciphertextAndTag) < tagSize {
		return "", errors.New("ciphertext too short")
	}

	ciphertext := ciphertextAndTag[:len(ciphertextAndTag)-tagSize]
	tag := ciphertextAndTag[len(ciphertextAndTag)-tagSize:]

	// Format: IV:AuthTag:Ciphertext (all hex)
	return fmt.Sprintf("%s:%s:%s",
		hex.EncodeToString(iv),
		hex.EncodeToString(tag),
		hex.EncodeToString(ciphertext)), nil
}
