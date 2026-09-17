import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const COLORS = {
  ink: "#141417",
  panel: "#1C1D22",
  panelAlt: "#232429",
  line: "#33343B",
  chalk: "#F3EFE6",
  chalkDim: "#A9A9B2",
  orange: "#E8592B",
  green: "#3FA66B",
  red: "#D8483D",
};

function formatMoney(value) {
  return Number(value || 0).toLocaleString();
}

function formatDateTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusColor(status) {
  if (status === "confirmed") return COLORS.green;
  if (status === "cancelled") return COLORS.red;
  if (status === "expired") return COLORS.chalkDim;
  return COLORS.orange;
}

export default function AdminHistory() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

  const loadHistory = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("booking_orders")
        .select("*")
        .in("status", [
          "confirmed",
          "cancelled",
          "expired",
        ])
        .order("created_at", {
          ascending: false,
        });

      if (error) throw error;

      setOrders(data || []);
    } catch (error) {
      console.error("Error loading booking history:", error);

      setMessage(
        "Couldn't load booking history."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filteredOrders = orders.filter((order) => {
    const search = searchTerm.toLowerCase();

    const matchesSearch =
        order.booking_reference?.toLowerCase().includes(search) ||
        order.customer_name?.toLowerCase().includes(search) ||
        order.customer_mobile?.toLowerCase().includes(search);

    const matchesStatus =
        statusFilter === "all" ||
        order.status === statusFilter;

    return matchesSearch && matchesStatus;
    });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              color: COLORS.chalkDim,
              fontSize: 12,
            }}
          >
            BOOKING HISTORY
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 3,
            }}
          >
            {filteredOrders.length} of {orders.length} records
          </div>
        </div>

        <button
          onClick={loadHistory}
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            background: COLORS.panelAlt,
            border: `1px solid ${COLORS.line}`,
            color: COLORS.chalk,
          }}
        >
          REFRESH
        </button>
      </div>

      <div
        className="history-filters"
        style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 20,
        }}
        >
        <input
            type="text"
            placeholder="Search reference, name, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
            flex: 1,
            minWidth: 250,
            padding: "11px 13px",
            borderRadius: 6,
            border: `1px solid ${COLORS.line}`,
            background: COLORS.panel,
            color: COLORS.chalk,
            outline: "none",
            }}
        />

        {["all", "confirmed", "cancelled", "expired"].map((status) => (
            <button
            key={status}
            onClick={() => setStatusFilter(status)}
            style={{
                padding: "10px 14px",
                borderRadius: 6,
                border: `1px solid ${COLORS.line}`,
                background:
                statusFilter === status
                    ? COLORS.orange
                    : COLORS.panelAlt,
                color:
                statusFilter === status
                    ? COLORS.ink
                    : COLORS.chalk,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
            }}
            >
            {status}
            </button>
        ))}
        </div>

      {message && (
        <div
          style={{
            padding: 14,
            borderRadius: 8,
            marginBottom: 16,
            border: `1px solid ${COLORS.red}`,
            color: COLORS.red,
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div
          style={{
            padding: 30,
            textAlign: "center",
            color: COLORS.chalkDim,
          }}
        >
          Loading history...
        </div>
      ) : orders.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            borderRadius: 10,
            background: COLORS.panel,
            border: `1px solid ${COLORS.line}`,
            color: COLORS.chalkDim,
          }}
        >
          No history records yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 12,
          }}
        >
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              style={{
                background: COLORS.panel,
                border: `1px solid ${COLORS.line}`,
                borderRadius: 10,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 20,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: statusColor(order.status),
                    }}
                  >
                    {order.status}
                  </div>

                  <div
                    style={{
                      fontSize: 21,
                      fontWeight: 700,
                      marginTop: 3,
                    }}
                  >
                    {order.booking_reference}
                  </div>
                </div>

                <div
                  style={{
                    textAlign: "right",
                  }}
                >
                  <div
                    style={{
                      color: COLORS.chalkDim,
                      fontSize: 11,
                    }}
                  >
                    TOTAL
                  </div>

                  <div
                    style={{
                      fontSize: 23,
                      fontWeight: 700,
                    }}
                  >
                    ₱{formatMoney(order.total_amount)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 15,
                  marginTop: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.chalkDim,
                    }}
                  >
                    CUSTOMER
                  </div>

                  <div>
                    {order.customer_name || "—"}
                  </div>

                  <div
                    style={{
                      color: COLORS.chalkDim,
                      fontSize: 13,
                    }}
                  >
                    {order.customer_mobile || "—"}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.chalkDim,
                    }}
                  >
                    PAYMENT
                  </div>

                  <div
                    style={{
                      textTransform: "uppercase",
                    }}
                  >
                    {order.payment_method || "—"}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.chalkDim,
                    }}
                  >
                    CREATED
                  </div>

                  <div>
                    {formatDateTime(order.created_at)}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLORS.chalkDim,
                    }}
                  >
                    CONFIRMED
                  </div>

                  <div>
                    {formatDateTime(order.confirmed_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}