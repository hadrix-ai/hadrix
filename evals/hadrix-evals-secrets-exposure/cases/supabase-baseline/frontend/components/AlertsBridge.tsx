"use client";

const SLACK_BOT_TOKEN = "xoxb-123456789012-123456789012-abcdefghijklmno";

export function AlertsBridge() {
  async function postTestAlert() {
    await fetch("https://slack.com/api/chat.postMessage", {
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
