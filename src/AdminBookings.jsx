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

function formatHour(hour) {
  const h = Number(hour);
  const period = h >= 12 ? "PM" : "AM";

  let displayHour = h % 12;
  if (displayHour === 0) displayHour = 12;

  return `${displayHour}:00 ${period}`;
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

export default function AdminBookings() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [cancellingId, setCancellingId] = useState(null);

  const loadConfirmedBookings = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: orderData, error: orderError } =
        await supabase
          .from("booking_orders")
          .select("*")
          .eq("status", "confirmed")
          .order("confirmed_at", {
            ascending: false,
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
        "Error loading confirmed bookings:",
        error
      );

      setMessage(
        "Couldn't load confirmed bookings."
      );
    } finally {
      setLoading(false);
    }
  };

    const cancelConfirmedBooking = async (order) => {
        const confirmed = window.confirm(
            `Cancel booking ${order.booking_reference}?\n\n` +
            `This will reopen all courts in this booking.`
        );

        if (!confirmed) return;

        setCancellingId(order.id);
        setMessage("");

        try {
            const { error } = await supabase.rpc(
            "cancel_confirmed_booking_order",
            {
                p_booking_reference: order.booking_reference,
            }
            );

            if (error) throw error;

            setOrders((current) =>
            current.filter((item) => item.id !== order.id)
            );
        } catch (error) {
            console.error("Error cancelling confirmed booking:", error);

            setMessage(
            "Couldn't cancel this booking. Please try again."
            );
        } finally {
            setCancellingId(null);
        }
    };

  useEffect(() => {
    loadConfirmedBookings();
  }, []);

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
            CONFIRMED BOOKINGS
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 3,
            }}
          >
            {orders.length} confirmed
          </div>
        </div>

        <button
          onClick={loadConfirmedBookings}
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
          Loading confirmed bookings...
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
          No confirmed bookings yet.
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
                      color: COLORS.green,
                      fontSize: 11,
                      letterSpacing: "0.1em",
                    }}
                  >
                    CONFIRMED
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

                  {order.customer_email && (
                    <div
                      style={{
                        color: COLORS.chalkDim,
                        fontSize: 13,
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
                    }}
                  >
                    CONFIRMED
                  </div>

                  <div>
                    {formatDateTime(order.confirmed_at)}
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
                className="confirmed-booking-actions"
                style={{
                    marginTop: 18,
                    display: "flex",
                    justifyContent: "flex-end",
                }}
                >
                <button
                    onClick={() => cancelConfirmedBooking(order)}
                    disabled={cancellingId === order.id}
                    style={{
                    padding: "11px 18px",
                    borderRadius: 6,
                    background: "transparent",
                    border: `1px solid ${COLORS.red}`,
                    color: COLORS.red,
                    fontWeight: 700,
                    cursor:
                        cancellingId === order.id
                        ? "default"
                        : "pointer",
                    opacity:
                        cancellingId === order.id
                        ? 0.6
                        : 1,
                    }}
                >
                    {cancellingId === order.id
                    ? "CANCELLING..."
                    : "CANCEL BOOKING"}
                </button>
                </div>
            </div>
            
          ))}
        </div>
      )}
    </div>
  );
}