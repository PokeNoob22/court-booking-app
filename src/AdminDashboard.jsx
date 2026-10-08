import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import AdminBookings from "./AdminBookings";
import AdminHistory from "./AdminHistory";
import AdminSchedule from "./AdminSchedule";
import AdminRentals from "./AdminRentals";

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

function formatHour(hour) {
  const h = Number(hour);
  const period = h >= 12 ? "PM" : "AM";

  let displayHour = h % 12;
  if (displayHour === 0) displayHour = 12;

  return `${displayHour}:00 ${period}`;
}

function groupBookingSchedules(bookings = []) {

    const sorted = [...bookings].sort((a, b) => {
        const courtA = a.courts?.name || `Court ${a.court_id}`;
        const courtB = b.courts?.name || `Court ${b.court_id}`;

        if (courtA !== courtB) {
        return courtA.localeCompare(courtB);
        }

        if (a.booking_date !== b.booking_date) {
        return a.booking_date.localeCompare(b.booking_date);
        }

        return Number(a.start_hour) - Number(b.start_hour);
    });

    const groups = [];

    for (const booking of sorted) {
        const courtName =
        booking.courts?.name || `Court ${booking.court_id}`;

        const startHour = Number(booking.start_hour);

        const previous = groups[groups.length - 1];

        if (
        previous &&
        previous.courtName === courtName &&
        previous.bookingDate === booking.booking_date &&
        previous.endHour === startHour
        ) {
        previous.endHour = startHour + 1;
        } else {
        groups.push({
            courtName,
            bookingDate: booking.booking_date,
            startHour,
            endHour: startHour + 1,
        });
        }
    }

    return groups;
}

export default function AdminDashboard({
  adminUser,
  onSignOut,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [adminView, setAdminView] = useState("payments");

  const loadSubmittedOrders = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: orderData, error: orderError } =
        await supabase
          .from("booking_orders")
          .select("*")
          .eq("status", "payment_submitted")
          .order("payment_submitted_at", {
            ascending: true,
          });

      if (orderError) throw orderError;

      const orderIds = (orderData || []).map(
        (order) => order.id
      );

      if (orderIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const { data: bookingData, error: bookingError } =
        await supabase
          .from("bookings")
          .select(`
            *,
            courts (
              name
            )
          `)
          .in("booking_order_id", orderIds)
          .order("booking_date", { ascending: true })
          .order("start_hour", { ascending: true });

      if (bookingError) throw bookingError;

      const combined = (orderData || []).map((order) => ({
        ...order,
        bookings: (bookingData || []).filter(
          (booking) =>
            booking.booking_order_id === order.id
        ),
      }));

      setOrders(combined);
    } catch (error) {
      console.error(
        "Error loading payment queue:",
        error
      );

      setMessage(
        "Couldn't load payment submissions."
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmPayment = async (order) => {
    const confirmed = window.confirm(
        `Confirm payment for ${order.booking_reference}?\n\n` +
        `Amount: ₱${formatMoney(order.total_amount)}\n` +
        `Customer: ${order.customer_name}`
    );

    if (!confirmed) return;

    setConfirmingId(order.id);
    setMessage("");

    try {
        const { error } = await supabase.rpc(
        "confirm_booking_order",
        {
            p_booking_reference: order.booking_reference,
        }
        );

        if (error) throw error;

        // Remove it immediately from the pending-payment queue
        setOrders((current) =>
        current.filter((item) => item.id !== order.id)
        );
    } catch (error) {
        console.error("Error confirming payment:", error);

        setMessage(
        "Couldn't confirm this payment. Please try again."
        );
    } finally {
        setConfirmingId(null);
    }
    };

    const rejectPayment = async (order) => {
        const confirmed = window.confirm(
            `Reject payment for ${order.booking_reference}?\n\n` +
            `This will cancel the booking and reopen all of its courts.`
        );

        if (!confirmed) return;

        setRejectingId(order.id);
        setMessage("");

        try {
            const { error } = await supabase.rpc(
            "reject_booking_order",
            {
                p_booking_reference: order.booking_reference,
            }
            );

            if (error) throw error;

            setOrders((current) =>
            current.filter((item) => item.id !== order.id)
            );
        } catch (error) {
            console.error("Error rejecting payment:", error);

            setMessage(
            "Couldn't reject this payment. Please try again."
            );
        } finally {
            setRejectingId(null);
        }
    };

  useEffect(() => {
    loadSubmittedOrders();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.ink,
        color: COLORS.chalk,
        fontFamily: "'Work Sans', sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${COLORS.line}`,
          padding: "24px 32px",
        }}
      >
        <div
            className="admin-header-inner"
            style={{
                maxWidth: 1100,
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                color: COLORS.orange,
                marginBottom: 4,
              }}
            >
              COURT BOOKING ADMIN
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 30,
              }}
            >
              Payment Queue
            </h1>

            <div
              style={{
                marginTop: 5,
                color: COLORS.chalkDim,
                fontSize: 13,
              }}
            >
              Signed in as {adminUser?.email}
            </div>
            flexWrap: "wrap",
            <div
                className="admin-nav"
                style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 16,
                }}
                >
                <button
                    onClick={() => setAdminView("payments")}
                    style={{
                    padding: "9px 14px",
                    borderRadius: 6,
                    background:
                        adminView === "payments"
                        ? COLORS.orange
                        : COLORS.panelAlt,
                    color:
                        adminView === "payments"
                        ? COLORS.ink
                        : COLORS.chalk,
                    border: `1px solid ${COLORS.line}`,
                    }}
                >
                    PAYMENT QUEUE
                </button>

                <button
                    onClick={() => setAdminView("bookings")}
                    style={{
                    padding: "9px 14px",
                    borderRadius: 6,
                    background:
                        adminView === "bookings"
                        ? COLORS.orange
                        : COLORS.panelAlt,
                    color:
                        adminView === "bookings"
                        ? COLORS.ink
                        : COLORS.chalk,
                    border: `1px solid ${COLORS.line}`,
                    }}
                >
                    CONFIRMED BOOKINGS
                </button>

                <button
                    onClick={() => setAdminView("history")}
                    style={{
                        padding: "9px 14px",
                        borderRadius: 6,
                        background:
                        adminView === "history"
                            ? COLORS.orange
                            : COLORS.panelAlt,
                        color:
                        adminView === "history"
                            ? COLORS.ink
                            : COLORS.chalk,
                        border: `1px solid ${COLORS.line}`,
                    }}
                    >
                    BOOKING HISTORY
                </button>

                <button
                    onClick={() => setAdminView("schedule")}
                    style={{
                        padding: "9px 14px",
                        borderRadius: 6,
                        background:
                        adminView === "schedule"
                            ? COLORS.orange
                            : COLORS.panelAlt,
                        color:
                        adminView === "schedule"
                            ? COLORS.ink
                            : COLORS.chalk,
                        border: `1px solid ${COLORS.line}`,
                    }}
                    >
                    SCHEDULE
                </button>

                <button
                  onClick={() => setAdminView("rentals")}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 6,
                    background:
                      adminView === "rentals"
                        ? COLORS.orange
                        : COLORS.panelAlt,
                    color:
                      adminView === "rentals"
                        ? COLORS.ink
                        : COLORS.chalk,
                    border: `1px solid ${COLORS.line}`,
                  }}
                >
                  RENTALS
                </button>

                {/* <button
                    onClick={() => setAdminView("courts")}
                    style={{
                        padding: "9px 14px",
                        borderRadius: 6,
                        background:
                        adminView === "courts"
                            ? COLORS.orange
                            : COLORS.panelAlt,
                        color:
                        adminView === "courts"
                            ? COLORS.ink
                            : COLORS.chalk,
                        border: `1px solid ${COLORS.line}`,
                    }}
                    >
                    MANAGE COURTS
                </button> */}

                </div>
          </div>

            <div
                className="admin-header-actions"
                style={{
                    display: "flex",
                    gap: 10,
                }}
            >
            <button
              onClick={loadSubmittedOrders}
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                background: COLORS.panelAlt,
                border: `1px solid ${COLORS.line}`,
                color: COLORS.chalk,
                cursor: "pointer",
              }}
            >
              REFRESH
            </button>

            <button
              onClick={onSignOut}
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                background: "transparent",
                border: `1px solid ${COLORS.line}`,
                color: COLORS.chalkDim,
                cursor: "pointer",
              }}
            >
              SIGN OUT
            </button>
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "28px 32px",
        }}
      >
        {adminView === "payments" && (
            <>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.chalkDim,
              }}
            >
              PAYMENT SUBMITTED
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                marginTop: 3,
              }}
            >
              {orders.length} waiting
            </div>
          </div>
        </div>

        {message && (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              marginBottom: 16,
              background: COLORS.panel,
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
            Loading payment submissions...
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
            No payments are currently waiting for verification.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            {orders.map((order) => (
              <div
                key={order.id}
                className="payment-card"
                style={{
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 10,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 20,
                    flexWrap: "wrap",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: COLORS.orange,
                        fontSize: 11,
                        letterSpacing: "0.1em",
                      }}
                    >
                      PAYMENT SUBMITTED
                    </div>

                    <div
                      style={{
                        fontSize: 22,
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
                        fontSize: 12,
                      }}
                    >
                      TOTAL
                    </div>

                    <div
                      style={{
                        fontSize: 26,
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
                      "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 16,
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: COLORS.chalkDim,
                        fontSize: 11,
                        marginBottom: 5,
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
                        marginTop: 3,
                      }}
                    >
                      {order.customer_mobile || "—"}
                    </div>

                    {order.customer_email && (
                      <div
                        style={{
                          color: COLORS.chalkDim,
                          fontSize: 13,
                          marginTop: 3,
                        }}
                      >
                        {order.customer_email}
                      </div>
                    )}
                  </div>

                  <div>
                    <div
                      style={{
                        color: COLORS.chalkDim,
                        fontSize: 11,
                        marginBottom: 5,
                      }}
                    >
                      PAYMENT METHOD
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
                        color: COLORS.chalkDim,
                        fontSize: 11,
                        marginBottom: 5,
                      }}
                    >
                      PAYMENT SUBMITTED
                    </div>

                    <div>
                      {formatDateTime(
                        order.payment_submitted_at
                      )}
                    </div>
                  </div>
                </div>

                <div
                    style={{
                        marginTop: 16,
                        marginBottom: 16,
                        padding: 14,
                        borderRadius: 8,
                        border: `1px solid ${COLORS.orange}`,
                        background: "rgba(232, 89, 43, 0.08)",
                    }}
                    >
                    <div
                        style={{
                        fontSize: 11,
                        color: COLORS.orange,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        marginBottom: 10,
                        }}
                    >
                        VERIFY PAYMENT
                    </div>

                    <div
                        className="verify-payment-grid"
                        style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 14,
                        }}
                    >
                        <div>
                        <div
                            style={{
                            fontSize: 10,
                            color: COLORS.chalkDim,
                            marginBottom: 3,
                            }}
                        >
                            AMOUNT
                        </div>

                        <strong>
                            ₱{Number(order.total_amount || 0).toLocaleString()}
                        </strong>
                        </div>

                        <div>
                        <div
                            style={{
                            fontSize: 10,
                            color: COLORS.chalkDim,
                            marginBottom: 3,
                            }}
                        >
                            METHOD
                        </div>

                        <strong style={{ textTransform: "uppercase" }}>
                            {order.payment_method || "—"}
                        </strong>
                        </div>

                        <div>
                        <div
                            style={{
                            fontSize: 10,
                            color: COLORS.chalkDim,
                            marginBottom: 3,
                            }}
                        >
                            REFERENCE
                        </div>

                        <strong>
                            {order.booking_reference}
                        </strong>
                        </div>

                        <div>
                        <div
                            style={{
                            fontSize: 10,
                            color: COLORS.chalkDim,
                            marginBottom: 3,
                            }}
                        >
                            SUBMITTED
                        </div>

                        <strong>
                            {formatDateTime(order.payment_submitted_at)}
                        </strong>
                        </div>
                    </div>
                    </div>

                <div
                  style={{
                    background: COLORS.ink,
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 8,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      color: COLORS.chalkDim,
                      fontSize: 11,
                      marginBottom: 10,
                    }}
                  >
                    SCHEDULES
                  </div>

                  {groupBookingSchedules(order.bookings || []).map(
                        (schedule) => (
                            <div
                            key={`${schedule.courtName}-${schedule.bookingDate}-${schedule.startHour}`}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 15,
                                padding: "8px 0",
                                borderBottom: `1px solid ${COLORS.line}`,
                            }}
                            >
                            <div>
                                {schedule.courtName}
                            </div>

                            <div
                                style={{
                                color: COLORS.chalkDim,
                                fontSize: 13,
                                textAlign: "right",
                                }}
                            >
                                {schedule.bookingDate}
                                {" · "}
                                {formatHour(schedule.startHour)}
                                {" – "}
                                {formatHour(schedule.endHour)}
                            </div>
                            </div>
                        )
                    )}
                </div>

                <div
                    className="payment-actions"
                    style={{
                        marginTop: 18,
                        display: "flex",
                        gap: 10,
                        justifyContent: "flex-end",
                    }}
                    >
                    <button
                        onClick={() => rejectPayment(order)}
                        disabled={
                            rejectingId === order.id ||
                            confirmingId === order.id
                        }
                        style={{
                            padding: "11px 18px",
                            borderRadius: 6,
                            background: "transparent",
                            border: `1px solid ${COLORS.red}`,
                            color: COLORS.red,
                            fontWeight: 700,
                            cursor:
                            rejectingId === order.id
                                ? "default"
                                : "pointer",
                            opacity:
                            rejectingId === order.id
                                ? 0.6
                                : 1,
                        }}
                        >
                        {rejectingId === order.id
                            ? "REJECTING..."
                            : "REJECT PAYMENT"}
                        </button>
                    
                    <button
                        onClick={() => confirmPayment(order)}
                        disabled={confirmingId === order.id}
                        style={{
                        padding: "11px 18px",
                        borderRadius: 6,
                        background: COLORS.green,
                        color: COLORS.ink,
                        fontWeight: 700,
                        cursor:
                            confirmingId === order.id
                            ? "default"
                            : "pointer",
                        opacity:
                            confirmingId === order.id
                            ? 0.6
                            : 1,
                        }}
                    >
                        {confirmingId === order.id
                        ? "CONFIRMING..."
                        : "CONFIRM PAYMENT"}
                    </button>
                    </div>
              </div>
            ))}
          </div>
        )}
        </>
    )}

        {adminView === "bookings" && (
            <AdminBookings />
        )}

        {adminView === "history" && (
            <AdminHistory />
        )}

        {adminView === "schedule" && (
            <AdminSchedule />
        )}

        {adminView === "rentals" && (
          <AdminRentals />
        )}

    </main>
    </div>
  );
}