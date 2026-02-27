import "@testing-library/jest-dom";

if (!process.env.NEXT_PUBLIC_SERVICE1_BASE_URL) {
  process.env.NEXT_PUBLIC_SERVICE1_BASE_URL = "http://localhost:8001";
}
if (!process.env.NEXT_PUBLIC_SERVICE2_BASE_URL) {
  process.env.NEXT_PUBLIC_SERVICE2_BASE_URL = "http://localhost:8002";
}
