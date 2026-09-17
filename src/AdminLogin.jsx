import React, { useState } from "react";
import { supabase } from "./supabaseClient";

const COLORS = {
  ink: "#141417",
  panel: "#1C1D22",
  panelAlt: "#232429",
  line: "#33343B",
  chalk: "#F3EFE6",
  chalkDim: "#A9A9B2",
  orange: "#E8592B",
  red: "#D8483D",
};

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const signIn = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      setMessage("Enter your email and password.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) throw error;

      const { data: isAdmin, error: adminError } =
        await supabase.rpc("is_admin");

      if (adminError) throw adminError;

      if (!isAdmin) {
        await supabase.auth.signOut();

        setMessage(
          "This account does not have administrator access."
        );

        return;
      }

      onLogin?.(data.user);
    } catch (error) {
      console.error("Admin login error:", error);

      setMessage(
        "Unable to sign in. Check your email and password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.ink,
        color: COLORS.chalk,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'Work Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: COLORS.panel,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 12,
          padding: 28,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            color: COLORS.orange,
            marginBottom: 5,
          }}
        >
          COURT BOOKING
        </div>

        <h1
          style={{
            margin: "0 0 6px",
            fontSize: 30,
          }}
        >
          Admin Login
        </h1>

        <p
          style={{
            marginTop: 0,
            marginBottom: 24,
            color: COLORS.chalkDim,
            fontSize: 14,
          }}
        >
          Sign in to manage payments and bookings.
        </p>

        <form onSubmit={signIn}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              marginBottom: 6,
              color: COLORS.chalkDim,
            }}
          >
            Email
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{
              width: "100%",
              padding: "11px 12px",
              marginBottom: 16,
              borderRadius: 6,
              border: `1px solid ${COLORS.line}`,
              background: COLORS.ink,
              color: COLORS.chalk,
              outline: "none",
            }}
          />

          <label
            style={{
              display: "block",
              fontSize: 12,
              marginBottom: 6,
              color: COLORS.chalkDim,
            }}
          >
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "11px 12px",
              marginBottom: 18,
              borderRadius: 6,
              border: `1px solid ${COLORS.line}`,
              background: COLORS.ink,
              color: COLORS.chalk,
              outline: "none",
            }}
          />

          {message && (
            <div
              style={{
                marginBottom: 16,
                color: COLORS.red,
                fontSize: 13,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 6,
              background: COLORS.orange,
              color: COLORS.ink,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>
      </div>
    </div>
  );
}