export async function checkProxyHttp(proxy: string, retries = 3): Promise<boolean> {
  const [host, port, user, pass] = proxy.split(":");
  if (!host || !port || !user || !pass) return false;

  const proxyUrl = `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 секунд на попытку

    try {
      const res = await fetch("http://httpbin.org/ip", {
        proxy: proxyUrl,
        signal: controller.signal,
        headers: {
          Connection: "close",
          "Proxy-Connection": "close",
        },
      });

      if (res.ok) {
        clearTimeout(timeout);
        return true; // сработало → валид
      }
    } catch {
      // глушим ошибку, пробуем ещё
    } finally {
      clearTimeout(timeout);
    }

    // если ещё не последний — маленькая пауза
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 200)); // 200мс бэкофф
    }
  }

  return false; // все попытки неудачные → невалид
}
