(function initEncryption(root) {
  const namespace = root.MelonTranslate = root.MelonTranslate || {};

  function bytesToBase64(bytes) {
    const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  async function deriveKey(secret) {
    const encoded = new TextEncoder().encode(secret);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  namespace.encryption = {
    async encryptText(secret, plainText) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(secret);
      const encoded = new TextEncoder().encode(plainText);
      const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
      return JSON.stringify({
        iv: bytesToBase64(iv),
        payload: bytesToBase64(new Uint8Array(cipherBuffer))
      });
    },
    async decryptText(secret, cipherText) {
      const parsed = JSON.parse(cipherText);
      const key = await deriveKey(secret);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(parsed.iv) },
        key,
        base64ToBytes(parsed.payload)
      );
      return new TextDecoder().decode(decrypted);
    }
  };
}(globalThis));