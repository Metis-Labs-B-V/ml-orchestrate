import axiosClient from "../lib/axiosClient";
import { render, screen, waitFor } from "@testing-library/react";

import HealthCheck from "../pages/system/health-check";

jest.mock("../lib/axiosClient");

const mockedAxios = axiosClient as jest.Mocked<typeof axiosClient>;

beforeEach(() => {
  mockedAxios.get.mockReset();
});

describe("HealthCheck page", () => {
  it("shows ok for both services when reachable", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { status: "ok" } });
    mockedAxios.get.mockResolvedValueOnce({ data: { status: "ok" } });

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getAllByText("ok").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows unreachable when one service is down", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("Network Error"));
    mockedAxios.get.mockResolvedValueOnce({ data: { status: "ok" } });

    render(<HealthCheck />);

    await waitFor(() => {
      expect(screen.getAllByText("unreachable").length).toBe(1);
      expect(screen.getAllByText("ok").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Service 1:/)).toBeInTheDocument();
    });
  });
});
