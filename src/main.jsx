import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import CourtBooking from "./CourtBooking";
import AdminLogin from "./AdminLogin";
import { supabase } from "./supabaseClient";
import AdminDashboard from "./AdminDashboard";

import "./base.css";

function App() {
  const isAdminPage = window.location.pathname.startsWith("/admin");

  const [adminUser, setAdminUser] = useState(null);
  const [checkingAdmin, setCheckingAdmin] = useState(isAdminPage);

  useEffect(() => {
    if (!isAdminPage) {
      return;
    }

    const checkExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          setAdminUser(null);
          setCheckingAdmin(false);
          return;
        }

        const { data: isAdmin, error } =
          await supabase.rpc("is_admin");

        if (error || !isAdmin) {
          await supabase.auth.signOut({ scope: "local" });

          setAdminUser(null);
          setCheckingAdmin(false);
          return;
        }

        setAdminUser(session.user);
        setCheckingAdmin(false);
      } catch (error) {
        console.error("Admin session check failed:", error);

        setAdminUser(null);
        setCheckingAdmin(false);
      }
    };

    checkExistingSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          setAdminUser(null);
        }

        if (event === "SIGNED_IN" && session?.user) {
          setAdminUser(session.user);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [isAdminPage]);

  if (!isAdminPage) {
    return <CourtBooking />;
  }

  if (checkingAdmin) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#141417",
          color: "#F3EFE6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Checking admin access...
      </div>
    );
  }

  if (!adminUser) {
    return (
      <AdminLogin
        onLogin={(user) => {
          setAdminUser(user);
        }}
      />
    );
  }

  return (
  <AdminDashboard
    adminUser={adminUser}
    onSignOut={async () => {
      await supabase.auth.signOut({
        scope: "local",
      });

      setAdminUser(null);
    }}
  />
);
}

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);