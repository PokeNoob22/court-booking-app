import React, { useEffect, useMemo, useState } from "react";
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

const HOURS = [
  6, 7, 8, 9, 10, 11,
  12, 13, 14, 15, 16, 17,
  18, 19, 20, 21, 22,
];

function formatHour(hour) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function todayString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function AdminSchedule() {
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [courts, setCourts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sportView, setSportView] = useState("pickleball");
  const [bookingSlot, setBookingSlot] = useState(null);
  const [bookingName, setBookingName] = useState("");
  const [bookingMobile, setBookingMobile] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  const [bookingDuration, setBookingDuration] = useState(1);
  const [savingBooking, setSavingBooking] = useState(false);

  const loadSchedule = async () => {
    setLoading(true);
    setMessage("");

    try {
        const { data: courtData, error: courtError } = await supabase
            .from("courts")
            .select("*")
            .order("id", { ascending: true });

        if (courtError) {
            console.error("COURT ERROR:", courtError);
            throw courtError;
        }

      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select("*")
        .eq("booking_date", selectedDate)
        .in("status", [
            "payment_pending",
            "payment_submitted",
            "confirmed",
        ]);

        if (bookingError) {
        console.error("BOOKING ERROR:", bookingError);
        throw bookingError;
        }

      setCourts(courtData || []);
      setBookings(bookingData || []);
    } catch (error) {
      console.error("Error loading admin schedule:", error);
      setMessage("Couldn't load the schedule.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, [selectedDate]);

  const getBooking = (courtId, hour) => {
    const court = courts.find((item) => item.id === courtId);

    if (!court) return null;

    // First check if this exact court has a booking.
    const directBooking = bookings.find(
        (booking) =>
        booking.court_id === courtId &&
        booking.start_hour === hour
    );

    if (directBooking) {
        return {
        ...directBooking,
        isBlocked: false,
        };
    }

    // BASKETBALL VIEW:
    // If Pickleball Court 7, 8, or 9 is being used,
    // Basketball must be blocked.
    if (court.court_type === "basketball") {
        const blockingBooking = bookings.find((booking) => {
        const bookedCourt = courts.find(
            (item) => item.id === booking.court_id
        );

        return (
            booking.start_hour === hour &&
            bookedCourt?.court_type === "pickleball" &&
            ["Pickleball Court 7", "Pickleball Court 8", "Pickleball Court 9"]
            .includes(bookedCourt?.name)
        );
        });

        if (blockingBooking) {
        return {
            ...blockingBooking,
            isBlocked: true,
            blockedBy: "PICKLEBALL",
        };
        }
    }

    // PICKLEBALL VIEW:
    // Basketball blocks Pickleball Courts 7, 8 and 9.
    if (
        court.court_type === "pickleball" &&
        ["Pickleball Court 7", "Pickleball Court 8", "Pickleball Court 9"]
        .includes(court.name)
    ) {
        const basketballBooking = bookings.find((booking) => {
        const bookedCourt = courts.find(
            (item) => item.id === booking.court_id
        );

        return (
            booking.start_hour === hour &&
            bookedCourt?.court_type === "basketball"
        );
        });

        if (basketballBooking) {
        return {
            ...basketballBooking,
            isBlocked: true,
            blockedBy: "BASKETBALL",
        };
        }
    }

    return null;
    };

  const getCellStyle = (booking) => {
    if (!booking) {
      return {
        background: COLORS.panelAlt,
        borderColor: COLORS.line,
        color: COLORS.chalkDim,
      };
    }

    if (booking.status === "confirmed") {
      return {
        background: "rgba(216, 72, 61, 0.18)",
        borderColor: COLORS.red,
        color: COLORS.red,
      };
    }

    if (booking.status === "payment_submitted") {
      return {
        background: "rgba(232, 89, 43, 0.18)",
        borderColor: COLORS.orange,
        color: COLORS.orange,
      };
    }

    return {
      background: "rgba(232, 89, 43, 0.10)",
      borderColor: COLORS.orange,
      color: COLORS.orange,
    };
  };

    const openAdminBooking = (court, hour) => {
      setBookingSlot({
        court,
        hour,
      });

      setBookingName("");
      setBookingMobile("");
      setBookingEmail("");
      setBookingDuration(1);
      setMessage("");
    };

    const closeAdminBooking = () => {

      setBookingSlot(null);
      setBookingName("");
      setBookingMobile("");
      setBookingEmail("");
      setBookingDuration(1);
    };

    const createAdminBooking = async () => {
      if (!bookingSlot || savingBooking) return;

      const name = bookingName.trim();
      const mobile = bookingMobile.trim();
      const email = bookingEmail.trim();

      if (!name) {
        setMessage("Customer name is required.");
        return;
      }

      if (!mobile) {
        setMessage("Customer mobile number is required.");
        return;
      }

      setSavingBooking(true);
      setMessage("");

      try {
        const { error } = await supabase.rpc(
          "admin_create_booking",
          {
            p_court_id: bookingSlot.court.id,
            p_booking_date: selectedDate,
            p_start_hour: bookingSlot.hour,
            p_duration_hours: Number(bookingDuration),
            p_customer_name: name,
            p_customer_mobile: mobile,
            p_customer_email: email || null,
          }
        );

        if (error) throw error;

        closeAdminBooking();
        await loadSchedule();

        setMessage("Booking created successfully.");
      } catch (error) {
        console.error("Error creating admin booking:", error);

        setMessage(
          error.message ||
            "Couldn't create the booking. Please try again."
        );
      } finally {
        setSavingBooking(false);
      }
    };

    const visibleCourts = useMemo(() => {
        if (sportView === "basketball") {
            return courts.filter(
            (court) => court.court_type === "basketball"
            );
        }

        return courts.filter(
            (court) => court.court_type === "pickleball"
        );
    }, [courts, sportView]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
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
            ADMIN SCHEDULE
          </div>

          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginTop: 3,
            }}
          >
            Court Schedule
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 6,
              border: `1px solid ${COLORS.line}`,
              background: COLORS.panel,
              color: COLORS.chalk,
            }}
          />

          <button
            onClick={loadSchedule}
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
        </div>
      </div>

        <div
            style={{
                display: "flex",
                gap: 10,
                marginBottom: 18,
            }}
            >
            <button
                onClick={() => setSportView("pickleball")}
                style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: `1px solid ${COLORS.line}`,
                background:
                    sportView === "pickleball"
                    ? COLORS.orange
                    : COLORS.panelAlt,
                color:
                    sportView === "pickleball"
                    ? COLORS.ink
                    : COLORS.chalk,
                fontWeight: 700,
                cursor: "pointer",
                }}
            >
                PICKLEBALL
            </button>

            <button
                onClick={() => setSportView("basketball")}
                style={{
                padding: "10px 16px",
                borderRadius: 6,
                border: `1px solid ${COLORS.line}`,
                background:
                    sportView === "basketball"
                    ? COLORS.orange
                    : COLORS.panelAlt,
                color:
                    sportView === "basketball"
                    ? COLORS.ink
                    : COLORS.chalk,
                fontWeight: 700,
                cursor: "pointer",
                }}
            >
                BASKETBALL
            </button>
        </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
          fontSize: 12,
          color: COLORS.chalkDim,
        }}
      >
        <span>OPEN</span>
        <span style={{ color: COLORS.orange }}>
          PAYMENT IN PROGRESS
        </span>
        <span style={{ color: COLORS.orange }}>
          PAYMENT SUBMITTED
        </span>
        <span style={{ color: COLORS.red }}>
          CONFIRMED
        </span>
      </div>

      {message && (
        <div
          style={{
            padding: 14,
            border: `1px solid ${COLORS.red}`,
            color: COLORS.red,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div
          style={{
            padding: 30,
            color: COLORS.chalkDim,
            textAlign: "center",
          }}
        >
          Loading schedule...
        </div>
      ) : (
            <div
                className="admin-schedule-scroll"
                style={{
                    width: "100%",
                    maxWidth: "100%",
                    margin: "0 auto",
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 10,
                    overflow: "hidden",
                }}
            >
          <table
            className="admin-schedule-table"
            style={{
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                tableLayout: "fixed",
                borderCollapse: "collapse",
            }}
            >
            <thead>
              <tr>
                <th
                  style={{
                    width: 95,
                    minWidth: 0,
                    padding: 12,
                    textAlign: "left",
                    background: COLORS.panel,
                    borderBottom: `1px solid ${COLORS.line}`,
                    color: COLORS.chalk
                  }}
                >
                  TIME
                </th>

                {visibleCourts.map((court) => (
                  <th
                    key={court.id}
                    style={{
                        minWidth: 0,
                        padding: "10px 4px",
                        fontSize: 13,
                        background: COLORS.panel,
                        borderBottom: `1px solid ${COLORS.line}`,
                        color: COLORS.chalk,
                        textAlign: "center",
                    }}
                  >
                    {court.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {HOURS.map((hour) => (
                <tr key={hour}>
                  <td
                    style={{
                        width: 95,
                        minWidth: 0,
                      padding: 12,
                      whiteSpace: "nowrap",
                      background: COLORS.panel,
                      borderBottom: `1px solid ${COLORS.line}`,
                      color: COLORS.chalkDim,
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                    }}
                  >
                    {formatHour(hour)}
                  </td>

                  {visibleCourts.map((court) => {
                    const booking = getBooking(court.id, hour);
                    const cellStyle = getCellStyle(booking);

                    return (
                      <td
                            key={`${court.id}-${hour}`}
                            style={{
                                minWidth: 0,
                                padding: 4,
                                borderBottom: `1px solid ${COLORS.line}`,
                            }}
                            >
                        <div
                        onClick={() => {
                          if (!booking) {
                            openAdminBooking(court, hour);
                          }
                        }}
                          style={{
                            minHeight: 64,
                            padding: 8,
                            borderRadius: 6,
                            border: `1px solid ${cellStyle.borderColor}`,
                            background: cellStyle.background,
                            color: cellStyle.color,
                            fontSize: 11,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            cursor: !booking ? "pointer" : "default",
                          }}
                        >
                          {!booking ? (
                            <span>OPEN</span>
                          ) : (
                            <>
                                <strong>
                                    {booking.isBlocked
                                    ? `BLOCKED BY ${booking.blockedBy}`
                                    : booking.status === "confirmed"
                                    ? "CONFIRMED"
                                    : booking.status === "payment_submitted"
                                    ? "PAYMENT SUBMITTED"
                                    : "PAYMENT IN PROGRESS"}
                                </strong>

                            {!booking.isBlocked && (
                                <>

                              <span
                                style={{
                                  marginTop: 4,
                                  color: COLORS.chalk,
                                }}
                              >
                                {booking.booking_orders?.customer_name ||
                                  "Customer"}
                              </span>

                              <span
                                style={{
                                  marginTop: 2,
                                  color: COLORS.chalkDim,
                                }}
                              >
                                {booking.booking_orders
                                  ?.booking_reference || ""}
                              </span>
                                </>
                            )}
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bookingSlot && (
        <div
          onClick={() => {
            if (!savingBooking) {
              closeAdminBooking();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.68)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 460,
              background: COLORS.panel,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 12,
              padding: 22,
              color: COLORS.chalk,
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                color: COLORS.orange,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                marginBottom: 5,
              }}
            >
              ADMIN BOOKING
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              {bookingSlot.court.name}
            </div>

            <div
              style={{
                color: COLORS.chalkDim,
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              {selectedDate} · {formatHour(bookingSlot.hour)}
            </div>

            <label
              style={{
                display: "block",
                fontSize: 12,
                color: COLORS.chalkDim,
                marginBottom: 5,
              }}
            >
              CUSTOMER NAME
            </label>

            <input
              value={bookingName}
              onChange={(e) => setBookingName(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              style={{
                width: "100%",
                padding: "11px 12px",
                marginBottom: 14,
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
                color: COLORS.chalkDim,
                marginBottom: 5,
              }}
            >
              MOBILE NUMBER
            </label>

            <input
              type="tel"
              value={bookingMobile}
              onChange={(e) => setBookingMobile(e.target.value)}
              placeholder="09171234567"
              style={{
                width: "100%",
                padding: "11px 12px",
                marginBottom: 14,
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
                color: COLORS.chalkDim,
                marginBottom: 5,
              }}
            >
              EMAIL — OPTIONAL
            </label>

            <input
              type="email"
              value={bookingEmail}
              onChange={(e) => setBookingEmail(e.target.value)}
              placeholder="customer@email.com"
              style={{
                width: "100%",
                padding: "11px 12px",
                marginBottom: 14,
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
                color: COLORS.chalkDim,
                marginBottom: 5,
              }}
            >
              DURATION
            </label>

            <select
              value={bookingDuration}
              onChange={(e) =>
                setBookingDuration(Number(e.target.value))
              }
              style={{
                width: "100%",
                padding: "11px 12px",
                marginBottom: 8,
                borderRadius: 6,
                border: `1px solid ${COLORS.line}`,
                background: COLORS.ink,
                color: COLORS.chalk,
                outline: "none",
              }}
            >
              {Array.from(
                { length: 23 - bookingSlot.hour },
                (_, index) => index + 1
              ).map((duration) => (
                <option key={duration} value={duration}>
                  {duration} {duration === 1 ? "Hour" : "Hours"}
                </option>
              ))}
            </select>

            <div
              style={{
                fontSize: 12,
                color: COLORS.chalkDim,
                marginBottom: 20,
              }}
            >
              {formatHour(bookingSlot.hour)}
              {" – "}
              {formatHour(
                bookingSlot.hour + Number(bookingDuration)
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={closeAdminBooking}
                disabled={savingBooking}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 7,
                  border: `1px solid ${COLORS.line}`,
                  background: "transparent",
                  color: COLORS.chalkDim,
                  cursor: savingBooking ? "default" : "pointer",
                  opacity: savingBooking ? 0.6 : 1,
                }}
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={createAdminBooking}
                disabled={savingBooking}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 7,
                  border: `1px solid ${COLORS.orange}`,
                  background: COLORS.orange,
                  color: COLORS.ink,
                  fontWeight: 700,
                  cursor: savingBooking ? "default" : "pointer",
                  opacity: savingBooking ? 0.6 : 1,
                }}
              >
                {savingBooking
                  ? "BOOKING..."
                  : "BOOK COURT"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}