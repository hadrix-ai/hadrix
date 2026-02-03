import React from "react";
import axios from "axios";
import kebabCase from "lodash/kebabCase";
import jwt from "jsonwebtoken";

const api = axios.create({ baseURL: "https://example.com", timeout: 1000 });

const slug = kebabCase("Hadrix vulnerable dependencies eval");
const decoded = jwt.decode(
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature"
);

export function App() {
  return (
    <main>
      <h1>{slug}</h1>
      <pre>{JSON.stringify(decoded)}</pre>
      <button type="button" onClick={() => void api.get("/health")}>
        Ping
      </button>
    </main>
  );
}

