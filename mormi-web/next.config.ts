import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Tunnel 주소(매번 바뀌는 *.trycloudflare.com)에서 dev 서버의
  // /_next/* 리소스를 불러올 수 있게 허용한다. 없으면 팀원 화면에서 클라이언트
  // JS가 차단돼 버튼이 먹통이 된다. 와일드카드라 터널 주소가 바뀌어도 그대로 동작.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
