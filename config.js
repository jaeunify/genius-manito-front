// ── 백엔드 API 주소 ──────────────────────────────
// 로컬(localhost)에서 열면 로컬 백엔드, 그 외(github.io 등)면 운영 백엔드로 자동 전환.
//
// 운영은 Cloudflare Tunnel의 https 주소를 사용합니다.
//   1) 백엔드 실행:   dotnet run           (genius-manito-backend, 7778 포트)
//   2) 터널 실행:     cloudflared tunnel --url http://localhost:7778
//   3) 출력된 https://xxx.trycloudflare.com 주소를 아래 PROD 에 붙여넣기
//   ⚠️ quick tunnel 주소는 터널을 재시작할 때마다 바뀝니다. 행사 기간엔 계속 켜두세요.
//      고정 주소가 필요하면 named tunnel(무료, Cloudflare 계정+도메인) 사용.
window.MANITO_CONFIG = {
  API_BASE:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:7778" // 로컬 개발용
      : "https://son-forgotten-diana-reform.trycloudflare.com", // ← 터널 https 주소로 교체
};

