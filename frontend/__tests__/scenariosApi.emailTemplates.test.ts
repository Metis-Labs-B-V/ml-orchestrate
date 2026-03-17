import { API_PATHS } from "../lib/apiPaths";
import {
  previewStoredEmailTemplate,
  testSendEmailTemplate,
} from "../lib/scenariosApi";
import { apiFetch } from "../lib/api";

jest.mock("../lib/api", () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const mockResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe("scenariosApi email template helpers", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("posts template test-send payload to the correct endpoint", async () => {
    mockedApiFetch.mockResolvedValueOnce(
      mockResponse(200, {
        status: "success",
        data: { ok: true, messageId: "msg-101" },
      })
    );

    const payload = {
      connection_id: 5,
      to: ["recipient@example.com"],
      cc: ["ops@example.com"],
      bcc: [],
      reply_to: "support@example.com",
      payload: { customer_name: "Ava" },
    };
    const result = await testSendEmailTemplate({
      templateId: 42,
      data: payload,
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      API_PATHS.emailTemplates.testSend(42),
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    expect(result).toEqual({ ok: true, messageId: "msg-101" });
  });

  it("throws backend message when test-send fails", async () => {
    mockedApiFetch.mockResolvedValueOnce(
      mockResponse(404, {
        status: "error",
        message: "Connection not found",
      })
    );

    await expect(
      testSendEmailTemplate({
        templateId: 42,
        data: {
          connection_id: 999,
          to: ["recipient@example.com"],
        },
      })
    ).rejects.toThrow("Connection not found");
  });

  it("posts stored preview payload to the template preview endpoint", async () => {
    mockedApiFetch.mockResolvedValueOnce(
      mockResponse(200, {
        status: "success",
        data: {
          subject: "Hello Ava",
          html: "<p>Hello Ava</p>",
          text: "Hello Ava",
          missing_variables: [],
          used_variables: ["customer_name"],
          context: { customer_name: "Ava" },
        },
      })
    );

    const payload = {
      payload: { customer_name: "Ava" },
      subject_override: "Hello Ava",
    };
    const result = await previewStoredEmailTemplate({
      templateId: 12,
      data: payload,
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      API_PATHS.emailTemplates.preview(12),
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    expect(result.subject).toBe("Hello Ava");
    expect(result.missing_variables).toEqual([]);
  });
});
