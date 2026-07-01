// 백엔드 API 주소. 로컬 개발이면 localhost, 배포(github.io)면 운영 서버로 자동 전환.
window.MANITO_CONFIG = {
  API_BASE:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:5236"
      : "https://YOUR-BACKEND-HOST", // TODO: 백엔드 배포 후 실제 주소로 교체
};
