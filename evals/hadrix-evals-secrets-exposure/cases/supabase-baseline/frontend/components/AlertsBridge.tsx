"use client";

const SLACK_BOT_TOKEN = "xoxb-123456789012-123456789012-abcdefghijklmno";
const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";

const mockSlackFetch: typeof fetch = async () => {
  return new Response(JSON.stringify({ ok: true, channel: "#alerts", ts: "1700000000.0000" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export function AlertsBridge() {
  // TODO: allow ops to pick a channel instead of hardcoding #alerts.
  // TODO: display the last test alert timestamp to avoid duplicate sends.
  async function postTestAlert() {
    await mockSlackFetch(SLACK_POST_MESSAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ channel: "#alerts", text: "Test alert" })
    });
  }

  return (
    <section>
      <h2>Alert bridge</h2>
      <p>Send a test alert from the browser.</p>
      <button onClick={() => void postTestAlert()}>Send test alert</button>
    </section>
  );
}
