import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

// Standalone-browser storage adapter. The original component expected a host-provided
// window.storage API. localStorage keeps the same data shape on this browser/device.
const storage = {
  async get(key) {
    const value = window.localStorage.getItem(key);
    return value === null ? null : { value };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
    return true;
  },
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Work+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');`;

const COLORS = {
  ink: "#141417",
  panel: "#1C1D22",
  panelAlt: "#232429",
  line: "#33343B",
  chalk: "#F3EFE6",
  chalkDim: "#A9A9B2",
  maple: "#C98A4E",
  orange: "#E8592B",
  orangeDim: "rgba(232,89,43,0.14)",
  green: "#3FA66B",
  greenDim: "rgba(63,166,107,0.10)",
  greenBorder: "rgba(63,166,107,0.35)",
  red: "#D8483D",
  redDim: "rgba(216,72,61,0.12)",
  redBorder: "rgba(216,72,61,0.35)",
};

const DEFAULT_COURTS = [
  { id: "c1", name: "Court 1" },
  { id: "c2", name: "Court 2" },
  { id: "c3", name: "Court 3" },
  { id: "c4", name: "Court 4" },
  { id: "c5", name: "Court 5" },
  { id: "c6", name: "Court 6" },
];

const START_HOUR = 6;
const END_HOUR = 23; // exclusive — last bookable slot starts at 22:00
const MAX_DAYS_AHEAD = 60;
const POLL_MS = 12000;

function pad(n) {
  return n.toString().padStart(2, "0");
}
function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isSameDay(a, b) {
  return dateKey(a) === dateKey(b);
}
function formatDateLabel(d) {
  return d
    .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}
function formatHour(h) {
  const period = h >= 12 ? "PM" : "AM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh}:00 ${period}`;
}
function hourRange(h) {
  return `${formatHour(h)} – ${formatHour(h + 1)}`;
}
function slotHours() {
  const arr = [];
  for (let h = START_HOUR; h < END_HOUR; h++) arr.push(h);
  return arr;
}
function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export default function CourtBooking() {
  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [courts, setCourts] = useState(null);
  const [bookings, setBookings] = useState({});
  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [activeSlot, setActiveSlot] = useState(null); // { courtId, hour, mode: 'book'|'view' }
  const [nameInput, setNameInput] = useState("");
  const [mobileInput, setMobileInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showManage, setShowManage] = useState(false);
  const [newCourtName, setNewCourtName] = useState("");
  const [pendingRemove, setPendingRemove] = useState(null);
  const toastTimer = useRef(null);
  const pollTimer = useRef(null);
  const [paymentBooking, setPaymentBooking] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [paymentTimeLeft, setPaymentTimeLeft] = useState(0);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedSport, setSelectedSport] = useState(null);
  const bottomCheckoutRef = useRef(null);
  const [bottomCheckoutVisible, setBottomCheckoutVisible] = useState(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const loadCourts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("courts")
        .select("*")
        .order("id", { ascending: true });

      if (error) throw error;

      setCourts(data || []);
    } catch (e) {
      console.error("Error loading courts:", e);
      setCourts([]);
      showToast("Couldn't load courts.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadBookings = useCallback(async (d, opts = {}) => {
    if (!opts.silent) setBookingsLoading(true);

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          court_id,
          booking_date,
          start_hour,
          status,
          hold_expires_at,
          booking_order_id
        `)
        .eq("booking_date", dateKey(d));

      if (error) throw error;

      const bookingMap = {};

      (data || []).forEach((booking) => {
        const slotKey = `${booking.court_id}__${booking.start_hour}`;
        bookingMap[slotKey] = booking;
      });

      setBookings(bookingMap);
    } catch (e) {
      console.error("Error loading bookings:", e);
      setBookings({});
      showToast("Couldn't load bookings.");
    } finally {
      if (!opts.silent) setBookingsLoading(false);
    }
  }, [showToast]);

  const toggleSelectedSlot = (court, hour) => {
    const key = `${court.id}__${dateKey(selectedDate)}__${hour}`;

    setSelectedSlots((current) => {
      const exists = current.some((slot) => slot.key === key);

      if (exists) {
        return current.filter((slot) => slot.key !== key);
      }

      return [
        ...current,
        {
          key,
          courtId: court.id,
          courtName: court.name,
          courtType: court.court_type,
          bookingDate: dateKey(selectedDate),
          hour,
          price: court.price_per_hour,
        },
      ];
    });
  };

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  useEffect(() => {
    loadBookings(selectedDate);
  }, [selectedDate, loadBookings]);

  useEffect(() => {
    if (!paymentBooking?.hold_expires_at) {
      setPaymentTimeLeft(0);
      return;
    }

    const updateTimer = () => {
      const expires = new Date(paymentBooking.hold_expires_at).getTime();
      const remaining = Math.max(
        0,
        Math.floor((expires - Date.now()) / 1000)
      );

      setPaymentTimeLeft(remaining);

      if (remaining === 0) {
        setPaymentBooking(null);
        setPaymentMethod(null);

        loadBookings(selectedDate, { silent: true });

        showToast("Payment time expired. The slot is available again.");
      }
    };

    updateTimer();

    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [paymentBooking]);

  // Live clock + gentle polling so the shared board stays current
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => {
      loadBookings(selectedDate, { silent: true });
    }, POLL_MS);
    return () => clearInterval(pollTimer.current);
  }, [selectedDate, loadBookings]);

  useEffect(() => {
    const target = bottomCheckoutRef.current;

    if (!target) {
      setBottomCheckoutVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setBottomCheckoutVisible(entry.isIntersecting);
      },
      {
        threshold: 0.2,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [selectedSlots.length]);

  const openSlot = (courtId, hour, mode) => {
    setActiveSlot({ courtId, hour, mode });
    setNameInput("");
    setMobileInput("");
    setEmailInput("");
  };

  const closeSlot = () => {
    setActiveSlot(null);
    setNameInput("");
    setMobileInput("");
    setEmailInput("");
  };

  const confirmBooking = async () => {
    const name = nameInput.trim();
    const mobile = mobileInput.trim();
    const email = emailInput.trim();

    if (!name || !mobile || !activeSlot) return;

    setSaving(true);

    try {
      const { data, error } = await supabase.rpc("create_booking_hold", {
        p_court_id: activeSlot.courtId,
        p_booking_date: dateKey(selectedDate),
        p_start_hour: activeSlot.hour,
        p_name: name,
        p_mobile: mobile,
        p_email: email || null,
      });

      if (error) throw error;

      const booking = Array.isArray(data) ? data[0] : data;

      const slotKey = `${booking.court_id}__${booking.start_hour}`;

      setBookings((current) => ({
        ...current,
        [slotKey]: booking,
      }));

      showToast("Slot held for 15 minutes. Continue to payment.");

      setPaymentBooking(booking);
      setPaymentMethod(null);
      closeSlot();
    } catch (e) {
      console.error("Error creating booking hold:", e);

      if (
        e.message?.includes("already being booked") ||
        e.message?.includes("convertible court area")
      ) {
        showToast("That slot is busy — someone else is booking it.");
        await loadBookings(selectedDate, { silent: true });
      } else {
        showToast("Couldn't start the booking. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const startCheckout = async () => {
    const name = nameInput.trim();
    const mobile = mobileInput.trim();
    const email = emailInput.trim();

    if (!name || !mobile || !paymentMethod || selectedSlots.length === 0) {
      return;
    }

    setSaving(true);

    try {
      const slots = selectedSlots.map((slot) => ({
        court_id: slot.courtId,
        booking_date: slot.bookingDate,
        start_hour: slot.hour,
      }));

      const { data, error } = await supabase.rpc(
        "create_booking_order_hold",
        {
          p_customer_name: name,
          p_customer_mobile: mobile,
          p_customer_email: email || null,
          p_payment_method: paymentMethod,
          p_slots: slots,
        }
      );

      if (error) throw error;

      const order = Array.isArray(data) ? data[0] : data;

      setPaymentBooking(order);

      setCheckoutOpen(false);

      setSelectedSlots([]);

      await loadBookings(selectedDate, { silent: true });

      showToast(
        "Your schedules are held for 15 minutes. Complete payment now."
      );
    } catch (e) {
      console.error("Error starting checkout:", e);

      if (
        e.message?.includes("no longer available") ||
        e.message?.includes("convertible") ||
        e.message?.includes("conflict")
      ) {
        showToast(
          "One or more selected schedules are no longer available."
        );

        await loadBookings(selectedDate, { silent: true });
      } else {
        showToast(
          "Couldn't start checkout. Please try again."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const cancelBooking = async () => {
    if (!activeSlot) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .eq("court_id", activeSlot.courtId)
        .eq("booking_date", dateKey(selectedDate))
        .eq("start_hour", activeSlot.hour);

      if (error) throw error;

      const slotKey = `${activeSlot.courtId}__${activeSlot.hour}`;

      setBookings((current) => {
        const updated = { ...current };
        delete updated[slotKey];
        return updated;
      });

      showToast("Booking canceled — slot is open again.");
      closeSlot();
    } catch (e) {
      console.error("Error canceling booking:", e);
      showToast("Couldn't cancel that booking. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const addCourt = async () => {
    const name = newCourtName.trim();
    if (!name) return;
    const id = `c${Date.now()}`;
    try {
      let latest = courts || [];
      try {
        const res = await storage.get("courts", true);
        latest = res && res.value ? JSON.parse(res.value) : latest;
      } catch (e) {
        /* use local */
      }
      const updated = [...latest, { id, name }];
      await storage.set("courts", JSON.stringify(updated), true);
      setCourts(updated);
      setNewCourtName("");
      showToast(`${name} added to the board.`);
    } catch (e) {
      showToast("Couldn't add that court. Try again.");
    }
  };

  const removeCourt = async (courtId) => {
    try {
      let latest = courts || [];
      try {
        const res = await storage.get("courts", true);
        latest = res && res.value ? JSON.parse(res.value) : latest;
      } catch (e) {
        /* use local */
      }
      const updated = latest.filter((c) => c.id !== courtId);
      await storage.set("courts", JSON.stringify(updated), true);
      setCourts(updated);
      setPendingRemove(null);
      showToast("Court removed.");
    } catch (e) {
      showToast("Couldn't remove that court. Try again.");
    }
  };

  const canGoPrev = !isSameDay(selectedDate, now) && selectedDate > now;
  const daysAhead = Math.round((selectedDate - new Date(now.toDateString())) / 86400000);
  const canGoNext = daysAhead < MAX_DAYS_AHEAD;

  const isToday = isSameDay(selectedDate, now);
  const currentHour = now.getHours();

  const visibleCourts = (courts || []).filter((court) => {
    if (selectedSport === "pickleball") {
      return court.court_type === "pickleball";
    }

    if (selectedSport === "basketball") {
      return court.court_type === "basketball";
    }

    return false;
  });

  const convertiblePickleballCourts = visibleCourts.filter(
    (court) =>
      court.court_type === "pickleball" &&
      court.resource_group === "convertible_area"
  );

  const hours = slotHours();

  const selectedTotal = selectedSlots.reduce(
    (total, slot) => total + Number(slot.price || 0),
    0
  );

  const groupedSelectedSlots = (() => {
    const groups = [];

    const sorted = [...selectedSlots].sort((a, b) => {
      if (a.bookingDate !== b.bookingDate) {
        return a.bookingDate.localeCompare(b.bookingDate);
      }

      if (a.courtId !== b.courtId) {
        return Number(a.courtId) - Number(b.courtId);
      }

      return a.hour - b.hour;
    });

    sorted.forEach((slot) => {
      const lastGroup = groups[groups.length - 1];

      const isConnected =
        lastGroup &&
        lastGroup.courtId === slot.courtId &&
        lastGroup.bookingDate === slot.bookingDate &&
        lastGroup.endHour === slot.hour;

      if (isConnected) {
        lastGroup.endHour = slot.hour + 1;
        lastGroup.price += Number(slot.price || 0);
      } else {
        groups.push({
          key: slot.key,
          courtId: slot.courtId,
          courtName: slot.courtName,
          bookingDate: slot.bookingDate,
          startHour: slot.hour,
          endHour: slot.hour + 1,
          price: Number(slot.price || 0),
        });
      }
    });

    return groups;
  })();

  const bookingBlocksResource = (booking) => {
    if (!booking) return false;

    if (
      booking.status === "confirmed" ||
      booking.status === "payment_submitted"
    ) {
      return true;
    }

    if (
      booking.status === "payment_pending" &&
      booking.hold_expires_at &&
      new Date(booking.hold_expires_at) > now
    ) {
      return true;
    }

    return false;
  };

  const getLinkedBlock = (court, hour) => {
    if (court.resource_group !== "convertible_area") {
      return null;
    }

    // Basketball is unavailable if PB7, PB8, or PB9 is being used
    if (court.court_type === "basketball") {
      const pickleballInUse = (courts || []).find((otherCourt) => {
        if (
          otherCourt.resource_group !== "convertible_area" ||
          otherCourt.court_type !== "pickleball"
        ) {
          return false;
        }

        const otherBooking =
          bookings[`${otherCourt.id}__${hour}`];

        return bookingBlocksResource(otherBooking);
      });

      if (pickleballInUse) {
        return {
          label: "Pickleball in use",
        };
      }
    }

    // PB7–PB9 are unavailable if Basketball is being used
    if (court.court_type === "pickleball") {
      const basketballCourt = (courts || []).find(
        (otherCourt) =>
          otherCourt.resource_group === "convertible_area" &&
          otherCourt.court_type === "basketball"
      );

      if (basketballCourt) {
        const basketballBooking =
          bookings[`${basketballCourt.id}__${hour}`];

        if (bookingBlocksResource(basketballBooking)) {
          return {
            label: "Basketball in use",
          };
        }
      }
    }

    return null;
  };

  const paymentAmount = Number(
    paymentBooking?.total_amount ??
    paymentBooking?.amount ??
    0
  );

  const cancelPaymentOrder = async () => {
    if (!paymentBooking?.booking_reference) return;

    try {
      setSaving(true);

      const { error } = await supabase.rpc(
        "cancel_booking_order_hold",
        {
          p_booking_reference:
            paymentBooking.booking_reference,
        }
      );

      if (error) throw error;

      // Close payment screen
      setPaymentBooking(null);
      setPaymentMethod(null);

      // Clear the customer's previous selections
      setSelectedSlots([]);

      // Reload the board so the released courts turn green again
      await loadBookings(selectedDate, { silent: true });

      showToast("Booking cancelled. Your selected courts are available again.");
    } catch (e) {
      console.error("Error cancelling booking:", e);
      showToast("Couldn't cancel the booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const submitPayment = async () => {
    if (!paymentBooking?.booking_reference || saving) return;

    setSaving(true);

    try {
      const { error } = await supabase.rpc(
        "submit_booking_order_payment",
        {
          p_booking_reference:
            paymentBooking.booking_reference,
        }
      );

      if (error) throw error;

      // Update this customer's payment screen immediately.
      setPaymentBooking((current) =>
        current
          ? {
              ...current,
              status: "payment_submitted",
              hold_expires_at: null,
            }
          : current
      );

      // Refresh the board so all slots now show payment submitted.
      await loadBookings(selectedDate, { silent: true });

      showToast(
        "Payment submitted. Your courts will remain reserved while we verify your payment."
      );
    } catch (e) {
      console.error("Error submitting payment:", e);

      showToast(
        "Couldn't submit your payment status. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.ink,
        color: COLORS.chalk,
        fontFamily: "'Work Sans', sans-serif",
      }}
    >
      <style>{FONT_IMPORT}</style>

      {/* Header */}
      <div
        className="px-4 sm:px-8 pt-8 pb-6"
        style={{ borderBottom: `1px solid ${COLORS.line}` }}
      >
        <div className="flex items-start justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <div
              className="flex items-center gap-2 mb-1"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: COLORS.maple }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: COLORS.green,
                  display: "inline-block",
                  boxShadow: `0 0 0 3px ${COLORS.greenDim}`,
                }}
              />
              LIVE BOARD · UPDATES AUTOMATICALLY
            </div>
            <h1
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 700,
                fontSize: "clamp(28px, 5vw, 40px)",
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              Court Board
            </h1>
            <p className="mt-2 text-sm" style={{ color: COLORS.chalkDim }}>
              Tap an open slot to book it instantly.
            </p>
          </div>
          {/* <button
            onClick={() => setShowManage((s) => !s)}
            className="shrink-0 text-xs px-3 py-2 rounded-md transition-colors"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.06em",
              background: showManage ? COLORS.orange : "transparent",
              color: showManage ? COLORS.ink : COLORS.chalkDim,
              border: `1px solid ${showManage ? COLORS.orange : COLORS.line}`,
            }}
          >
            MANAGE COURTS
          </button> */}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6">

        {/* Sport selector */}
        <div
          className="rounded-lg p-4 mb-5"
          style={{
            background: COLORS.panel,
            border: `1px solid ${COLORS.line}`,
          }}
        >
          <div
            className="text-center mb-3"
            style={{
              fontFamily: "'Oswald', sans-serif",
              fontWeight: 600,
              fontSize: 20,
              textTransform: "uppercase",
            }}
          >
            What would you like to book?
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setSelectedSport("pickleball");
                setSelectedSlots([]);
              }}
              className="rounded-lg p-4"
              style={{
                background:
                  selectedSport === "pickleball"
                    ? COLORS.orange
                    : COLORS.panelAlt,

                color:
                  selectedSport === "pickleball"
                    ? COLORS.ink
                    : COLORS.chalk,

                border: `1px solid ${
                  selectedSport === "pickleball"
                    ? COLORS.orange
                    : COLORS.line
                }`,
              }}
            >
              <div
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 600,
                  fontSize: 20,
                }}
              >
                PICKLEBALL
              </div>

              <div className="text-xs mt-1">
                9 Courts · ₱550 / hour
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedSport("basketball");
                setSelectedSlots([]);
              }}
              className="rounded-lg p-4"
              style={{
                background:
                  selectedSport === "basketball"
                    ? COLORS.orange
                    : COLORS.panelAlt,

                color:
                  selectedSport === "basketball"
                    ? COLORS.ink
                    : COLORS.chalk,

                border: `1px solid ${
                  selectedSport === "basketball"
                    ? COLORS.orange
                    : COLORS.line
                }`,
              }}
            >
              <div
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 600,
                  fontSize: 20,
                }}
              >
                BASKETBALL
              </div>

              <div className="text-xs mt-1">
                1 Court · ₱2,000 / hour
              </div>
            </button>
          </div>

          <p
            className="text-xs mt-3 text-center"
            style={{ color: COLORS.chalkDim }}
          >
            Pickleball Courts 7–9 combine to form the Basketball Court.
          </p>
        </div>

        {selectedSport && (
          <>

        {/* Date scoreboard nav */}
        <div
          className="flex items-center justify-between rounded-lg px-4 py-3 mb-5"
          style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}` }}
        >
          <button
            onClick={() => canGoPrev && setSelectedDate((d) => addDays(d, -1))}
            disabled={!canGoPrev}
            className="px-3 py-2 rounded-md text-sm"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: canGoPrev ? COLORS.chalk : COLORS.line,
              cursor: canGoPrev ? "pointer" : "default",
            }}
            aria-label="Previous day"
          >
            ‹ PREV
          </button>
          <div className="text-center">
            <div
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 600,
                fontSize: 22,
                letterSpacing: "0.06em",
                color: COLORS.chalk,
              }}
            >
              {formatDateLabel(selectedDate)}
            </div>
            {isToday && (
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: COLORS.maple,
                }}
              >
                TODAY
              </div>
            )}
          </div>
          <button
            onClick={() => canGoNext && setSelectedDate((d) => addDays(d, 1))}
            disabled={!canGoNext}
            className="px-3 py-2 rounded-md text-sm"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: canGoNext ? COLORS.chalk : COLORS.line,
              cursor: canGoNext ? "pointer" : "default",
            }}
            aria-label="Next day"
          >
            NEXT ›
          </button>
        </div>

        <div
          className="business-info-card"
          style={{
            marginTop: 16,
            marginBottom: 18,
            padding: 14,
            borderRadius: 8,
            background: COLORS.panel,
            border: `1px solid ${COLORS.line}`,
          }}
        >
          <div
            style={{
              fontFamily: "'Oswald', sans-serif",
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            COURT INFORMATION
          </div>

          <div
            style={{
              display: "grid",
              gap: 6,
              fontSize: 13,
              color: COLORS.chalkDim,
            }}
          >
            <div>
              <strong style={{ color: COLORS.chalk }}>
                Location:
              </strong>{" "}
              Add your court address here
            </div>

            <div>
              <strong style={{ color: COLORS.chalk }}>
                Contact:
              </strong>{" "}
              Add your mobile number here
            </div>

            <div>
              <strong style={{ color: COLORS.chalk }}>
                Payment:
              </strong>{" "}
              GCash payment is currently available.
            </div>

            <div>
              <strong style={{ color: COLORS.chalk }}>
                Cancellation:
              </strong>{" "}
              Contact support if you need help with a confirmed booking.
            </div>
          </div>
        </div>

        {/* Manage courts panel */}
        {showManage && (
          <div
            className="rounded-lg p-4 mb-5"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}` }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.1em",
                color: COLORS.chalkDim,
              }}
              className="mb-3"
            >
              COURTS ON THIS BOARD
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {(courts || []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md text-sm"
                  style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.line}` }}
                >
                  <span>{c.name}</span>
                  {pendingRemove === c.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => removeCourt(c.id)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ background: COLORS.red, color: COLORS.chalk }}
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setPendingRemove(null)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ color: COLORS.chalkDim }}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setPendingRemove(c.id)}
                      style={{ color: COLORS.chalkDim }}
                      aria-label={`Remove ${c.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newCourtName}
                onChange={(e) => setNewCourtName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCourt()}
                placeholder="New court name (e.g. Court 7)"
                className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
                style={{
                  background: COLORS.ink,
                  border: `1px solid ${COLORS.line}`,
                  color: COLORS.chalk,
                }}
              />
              <button
                onClick={addCourt}
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ background: COLORS.orange, color: COLORS.ink }}
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-5 mb-3 text-xs" style={{ color: COLORS.chalkDim, fontFamily: "'JetBrains Mono', monospace" }}>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.green, display: "inline-block" }} />
            OPEN
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.red, display: "inline-block" }} />
            BOOKED
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.line, display: "inline-block" }} />
            PAST
          </span>
        </div>

        {/* Grid */}
        {loading || !courts ? (
          <div className="py-16 text-center text-sm" style={{ color: COLORS.chalkDim }}>
            Loading board…
          </div>
        ) : courts.length === 0 ? (
          <div
            className="py-16 text-center text-sm rounded-lg"
            style={{ color: COLORS.chalkDim, background: COLORS.panel, border: `1px solid ${COLORS.line}` }}
          >
            No courts yet. Open "Manage courts" to add one.
          </div>
        ) : (
          <div
            className="rounded-lg schedule-scroll"
            style={{
              border: `1px solid ${COLORS.line}`,
              width: "100%",
            }}
          >
            <div
              className="court-board-grid"
              style={{ "--court-count": visibleCourts.length }}
            >
              {/* Header row */}
              <div
                className="flex sticky top-0 z-20 schedule-header-row"
                style={{ background: COLORS.panelAlt }}
              >
                <div
                  className="time-column-header sticky left-0 z-30 flex items-center px-3 py-3 text-xs"
                  style={{
                    background: COLORS.panelAlt,
                    borderRight: `1px solid ${COLORS.line}`,
                    borderBottom: `1px solid ${COLORS.line}`,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: COLORS.chalkDim,
                  }}
                >
                  TIME
                </div>
                {visibleCourts.map((c, idx) => (
                  <div
                    key={c.id}
                    className="court-column-header flex flex-col items-center justify-center py-2 text-center"
                    style={{
                      borderRight: `1px solid ${COLORS.line}`,
                      borderBottom: `1px solid ${COLORS.line}`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        color: COLORS.maple,
                      }}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div className="court-name text-sm font-medium px-2">
                      {c.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {hours.map((h) => {
                const isPastRow = isToday && h < currentHour;
                return (
                  <div className="flex schedule-row" key={h}>
                    <div
                      className="time-column-cell sticky left-0 z-10 flex items-center px-3 text-xs"
                      style={{
                        height: 52,
                        background: COLORS.panel,
                        borderRight: `1px solid ${COLORS.line}`,
                        borderBottom: `1px solid ${COLORS.line}`,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: isPastRow ? COLORS.line : COLORS.chalkDim,
                      }}
                    >
                      {formatHour(h)}
                    </div>
                    {visibleCourts.map((c) => {
                      const slotKey = `${c.id}__${h}`;
                      const booking = bookings[slotKey];

                      const courtIndex = visibleCourts.findIndex(
                        (court) => court.id === c.id
                      );

                      const isPaymentHold =
                        booking &&
                        booking.status === "payment_pending" &&
                        booking.hold_expires_at &&
                        new Date(booking.hold_expires_at) > now;

                      const samePaymentOrder = (otherCourt) => {
                        if (!otherCourt || !booking?.booking_order_id) {
                          return false;
                        }

                        const otherBooking =
                          bookings[`${otherCourt.id}__${h}`];

                        return (
                          otherBooking &&
                          otherBooking.status === "payment_pending" &&
                          otherBooking.booking_order_id === booking.booking_order_id &&
                          otherBooking.hold_expires_at &&
                          new Date(otherBooking.hold_expires_at) > now
                        );
                      };

                      const previousCourt =
                        visibleCourts[courtIndex - 1];

                      const paymentContinuesFromLeft =
                        isPaymentHold &&
                        samePaymentOrder(previousCourt);

                      let paymentSpan = 1;

                      if (isPaymentHold && !paymentContinuesFromLeft) {
                        for (
                          let i = courtIndex + 1;
                          i < visibleCourts.length;
                          i++
                        ) {
                          if (samePaymentOrder(visibleCourts[i])) {
                            paymentSpan++;
                          } else {
                            break;
                          }
                        }
                      }

                      const selectionKey = `${c.id}__${dateKey(selectedDate)}__${h}`;

                      const isSelected = selectedSlots.some(
                        (slot) => slot.key === selectionKey
                      );

                      const past = isPastRow;
                      let bg = COLORS.panel;
                      let border = COLORS.line;
                      let dot = COLORS.line;
                      let label = "Open";

                      const activeHold =
                        booking &&
                        booking.status === "payment_pending" &&
                        booking.hold_expires_at &&
                        new Date(booking.hold_expires_at) > now;
                        const linkedBlock = getLinkedBlock(c, h);

                        const isConvertiblePickleball =
                          c.court_type === "pickleball" &&
                          c.resource_group === "convertible_area";

                        const basketballMergedBlock =
                          selectedSport === "pickleball" &&
                          isConvertiblePickleball &&
                          linkedBlock?.label === "Basketball in use";

                        const isFirstConvertibleCourt =
                          c.id === convertiblePickleballCourts[0]?.id;

                      if (past) {
                        bg = COLORS.panel;
                        dot = COLORS.line;
                        label = "—";

                      } else if (activeHold) {
                        bg = COLORS.orangeDim;
                        border = COLORS.orange;
                        dot = COLORS.orange;
                        label = "Payment\nin progress";

                      } else if (
                        booking &&
                        booking.status === "payment_submitted"
                      ) {
                        bg = COLORS.orangeDim;
                        border = COLORS.orange;
                        dot = COLORS.orange;
                        label = "Payment submitted";

                      } else if (
                        booking &&
                        booking.status === "confirmed"
                      ) {
                        bg = COLORS.redDim;
                        border = COLORS.redBorder;
                        dot = COLORS.red;
                        label = "BOOKED";

                      } else if (linkedBlock) {
                        bg = COLORS.orangeDim;
                        border = COLORS.orange;
                        dot = COLORS.orange;
                        label = linkedBlock.label;

                      } else if (isSelected) {
                        bg = COLORS.orangeDim;
                        border = COLORS.orange;
                        dot = COLORS.orange;
                        label = "✓ Selected";

                      } else {
                        bg = COLORS.greenDim;
                        border = COLORS.greenBorder;
                        dot = COLORS.green;
                        label = "Open";
                      }

                      if (basketballMergedBlock && !isFirstConvertibleCourt) {
                        return null;
                      }

                      if (paymentContinuesFromLeft) {
                        return null;
                      }

                      return (
                        <button
                          key={c.id}
                          disabled={
                            past ||
                            activeHold ||
                            Boolean(linkedBlock) ||
                            booking?.status === "payment_submitted"
                          }
                          onClick={() => {
                            if (activeHold) {
                              showToast("Busy — someone is currently completing payment for this slot.");
                              return;
                            }

                            if (booking && booking.status === "confirmed") {
                              openSlot(c.id, h, "view");
                              return;
                            }

                            toggleSelectedSlot(c, h);
                          }}
                          className="court-slot flex flex-col items-center justify-center gap-1 transition-transform"
                          style={{
                            height: 52,

                            flex: basketballMergedBlock
                              ? "3 1 0"
                              : paymentSpan > 1
                                ? `${paymentSpan} 1 0`
                                : "1 1 0",
                            width: 0,
                            minWidth: 0,

                            background: bg,
                            borderRight: `1px solid ${COLORS.line}`,
                            borderBottom: `1px solid ${COLORS.line}`,
                            borderLeft: booking && !past ? `2px solid ${border}` : "2px solid transparent",
                            cursor: past ? "default" : "pointer",
                            opacity: past ? 0.45 : 1,
                          }}
                        >
                          <span className="flex items-center gap-1.5">
                            {!past && (
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: 999,
                                  background: dot,
                                  display: "inline-block",
                                }}
                              />
                            )}
                            <span
                              className="slot-label text-xs"
                              style={{
                                fontFamily: booking ? "'Work Sans', sans-serif" : "'JetBrains Mono', monospace",
                                color: past ? COLORS.line : booking ? COLORS.chalk : COLORS.chalkDim,
                                letterSpacing: booking ? "normal" : "0.06em",
                              }}
                            >
                              {label}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedSlots.length > 0 && (
          <div
            className="mt-5 rounded-lg p-4"
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.line}`,
            }}
          >
            <div
              className="mb-3"
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 600,
                fontSize: 20,
                textTransform: "uppercase",
              }}
            >
              Selected schedules
            </div>

            <div className="space-y-2 mb-4">
              {groupedSelectedSlots.map((slot) => (
                <div
                  key={slot.key}
                  className="flex items-center justify-between gap-3 text-sm"
                  style={{
                    borderBottom: `1px solid ${COLORS.line}`,
                    paddingBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {slot.courtName}
                    </div>

                    <div
                      className="text-xs"
                      style={{ color: COLORS.chalkDim }}
                    >
                      {slot.bookingDate} · {formatHour(slot.startHour)} – {formatHour(slot.endHour)}
                    </div>
                  </div>

                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: COLORS.chalk,
                    }}
                  >
                    ₱{slot.price}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div
                className="text-sm"
                style={{ color: COLORS.chalkDim }}
              >
                {selectedSlots.length} selected
              </div>

              <div
                style={{
                  fontFamily: "'Oswald', sans-serif",
                  fontWeight: 600,
                  fontSize: 22,
                }}
              >
                Total: ₱{selectedTotal}
              </div>
            </div>

            <button
              ref={bottomCheckoutRef}
              onClick={() => setCheckoutOpen(true)}
              className="w-full py-3 rounded-md font-medium"
              style={{
                background: COLORS.orange,
                color: COLORS.ink,
              }}
            >
              PROCEED TO PAYMENT
            </button>
          </div>
        )}

        <p className="mt-4 text-xs" style={{ color: COLORS.line, fontFamily: "'JetBrains Mono', monospace" }}>
          BOARD IS SHARED — EVERYONE WHO OPENS THIS SEES THE SAME COURTS AND BOOKINGS.
        </p>

          </>
        )}

      </div>

      {checkoutOpen && (
        <div
          className="checkout-overlay fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => {
            setCheckoutOpen(false);
            setPaymentMethod(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="checkout-modal-content w-full max-w-md rounded-xl p-5"
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.line}`,
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.1em",
                color: COLORS.maple,
              }}
            >
              CHECKOUT
            </div>

            <h2
              className="mt-1 mb-4"
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 600,
                fontSize: 24,
                textTransform: "uppercase",
              }}
            >
              Your details
            </h2>

            <div
              className="mb-4 rounded-lg p-3 text-sm"
              style={{
                background: COLORS.ink,
                border: `1px solid ${COLORS.line}`,
              }}
            >
              <div
                className="mb-3"
                style={{
                  fontSize: 11,
                  color: COLORS.chalkDim,
                  letterSpacing: "0.08em",
                }}
              >
                BOOKING SUMMARY
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {groupedSelectedSlots.map((group, index) => (
                  <div
                    key={`${group.courtId}-${group.startHour}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      paddingBottom: 8,
                      borderBottom: `1px solid ${COLORS.line}`,
                    }}
                  >
                    <span>
                      {group.courtName}
                    </span>

                    <span
                      style={{
                        color: COLORS.chalkDim,
                        textAlign: "right",
                      }}
                    >
                      {formatHour(group.startHour)}
                      {" – "}
                      {formatHour(group.endHour)}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="flex justify-between mb-1"
              >
                <span style={{ color: COLORS.chalkDim }}>
                  Selected hours
                </span>

                <span>
                  {selectedSlots.length}
                </span>
              </div>

              <div
                className="flex justify-between"
                style={{
                  marginTop: 6,
                  paddingTop: 8,
      borderTop: `1px solid ${COLORS.line}`,
    }}
  >
    <span style={{ color: COLORS.chalkDim }}>
      Total
    </span>

    <span
      style={{
        fontWeight: 700,
        fontSize: 17,
      }}
    >
      ₱{selectedTotal.toLocaleString()}
    </span>
  </div>
</div>

            <label
              className="text-xs block mb-1"
              style={{ color: COLORS.chalkDim }}
            >
              Booking name *
            </label>

            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              className="w-full px-3 py-2 rounded-md text-sm outline-none mb-4"
              style={{
                background: COLORS.ink,
                border: `1px solid ${COLORS.line}`,
                color: COLORS.chalk,
              }}
            />

            <p
              className="text-xs -mt-2 mb-4"
              style={{ color: COLORS.chalkDim }}
            >
              Name the reservation will be under.
            </p>

            <label
              className="text-xs block mb-1"
              style={{ color: COLORS.chalkDim }}
            >
              Mobile number *
            </label>

            <input
              value={mobileInput}
              onChange={(e) => setMobileInput(e.target.value)}
              placeholder="e.g. 09171234567"
              className="w-full px-3 py-2 rounded-md text-sm outline-none mb-4"
              style={{
                background: COLORS.ink,
                border: `1px solid ${COLORS.line}`,
                color: COLORS.chalk,
              }}
            />

            <label
              className="text-xs block mb-1"
              style={{ color: COLORS.chalkDim }}
            >
              Email
            </label>

            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-md text-sm outline-none mb-4"
              style={{
                background: COLORS.ink,
                border: `1px solid ${COLORS.line}`,
                color: COLORS.chalk,
              }}
            />

            <div
              className="text-xs mb-2"
              style={{ color: COLORS.chalkDim }}
            >
              Payment method *
            </div>

            <div className="grid grid-cols-2 gap-2 mb-5">
              <button
                onClick={() => setPaymentMethod("gcash")}
                className="py-3 rounded-md"
                style={{
                  background:
                    paymentMethod === "gcash"
                      ? COLORS.orange
                      : COLORS.panelAlt,
                  color:
                    paymentMethod === "gcash"
                      ? COLORS.ink
                      : COLORS.chalk,
                  border: `1px solid ${COLORS.line}`,
                }}
              >
                GCash
              </button>

              <button
                onClick={() => setPaymentMethod("bank")}
                className="py-3 rounded-md"
                style={{
                  background:
                    paymentMethod === "bank"
                      ? COLORS.orange
                      : COLORS.panelAlt,
                  color:
                    paymentMethod === "bank"
                      ? COLORS.ink
                      : COLORS.chalk,
                  border: `1px solid ${COLORS.line}`,
                }}
              >
                Bank Transfer
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCheckoutOpen(false);
                  setPaymentMethod(null);
                }}
                className="flex-1 py-2.5 rounded-md text-sm"
                style={{
                  color: COLORS.chalkDim,
                  border: `1px solid ${COLORS.line}`,
                }}
              >
                Back
              </button>

              <button
                onClick={startCheckout}
                disabled={
                  saving ||
                  !nameInput.trim() ||
                  !mobileInput.trim() ||
                  !paymentMethod
                }
                className="flex-1 py-2.5 rounded-md text-sm font-medium"
                style={{
                  background: COLORS.orange,
                  color: COLORS.ink,
                  opacity:
                    saving ||
                    !nameInput.trim() ||
                    !mobileInput.trim() ||
                    !paymentMethod
                      ? 0.5
                      : 1,
                      cursor: saving ? "default" : "pointer",
                }}
              >
                {saving ? "STARTING PAYMENT..." : "CONTINUE TO PAYMENT"}
              </button>
            </div>

            <p
              className="mt-3 text-xs"
              style={{ color: COLORS.line }}
            >
              Your selected schedules are not held until you continue to payment.
            </p>
          </div>
        </div>
      )}

      {/* Slot panel (book / view) */}
      {activeSlot && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={closeSlot}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-96 rounded-t-xl sm:rounded-xl p-5"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}` }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.1em",
                color: COLORS.maple,
              }}
            >
              {(courts.find((c) => c.id === activeSlot.courtId) || {}).name} · {hourRange(activeSlot.hour)}
            </div>

            {activeSlot.mode === "book" ? (
              <>
                <h2
                  className="mt-1 mb-4"
                  style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 22, textTransform: "uppercase" }}
                >
                  Book this slot
                </h2>
                <label className="text-xs block mb-1" style={{ color: COLORS.chalkDim }}>
                  Your name
                </label>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmBooking()}
                  placeholder="e.g. Jordan"
                  className="w-full px-3 py-2 rounded-md text-sm outline-none mb-4"
                  style={{ background: COLORS.ink, border: `1px solid ${COLORS.line}`, color: COLORS.chalk }}
                />
                <label className="text-xs block mb-1" style={{ color: COLORS.chalkDim }}>
                  Mobile number
                </label>

                <input
                  value={mobileInput}
                  onChange={(e) => setMobileInput(e.target.value)}
                  placeholder="e.g. 09171234567"
                  className="w-full px-3 py-2 rounded-md text-sm outline-none mb-4"
                  style={{
                    background: COLORS.ink,
                    border: `1px solid ${COLORS.line}`,
                    color: COLORS.chalk,
                  }}
                />

                <label className="text-xs block mb-1" style={{ color: COLORS.chalkDim }}>
                  Email
                </label>

                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-md text-sm outline-none mb-4"
                  style={{
                    background: COLORS.ink,
                    border: `1px solid ${COLORS.line}`,
                    color: COLORS.chalk,
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={closeSlot}
                    className="flex-1 py-2.5 rounded-md text-sm"
                    style={{ color: COLORS.chalkDim, border: `1px solid ${COLORS.line}` }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmBooking}
                    disabled={!nameInput.trim() || !mobileInput.trim() || saving}
                    className="flex-1 py-2.5 rounded-md text-sm font-medium"
                    style={{
                      background: COLORS.orange,
                      color: COLORS.ink,
                      opacity: !nameInput.trim() || saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? "Starting payment…" : "Continue to payment"}
                  </button>
                </div>
                <p className="mt-3 text-xs" style={{ color: COLORS.line }}>
                  Your slot will be held for 15 minutes while you complete payment.
                </p>
              </>
            ) : (
              <>
                <h2
                  className="mt-1 mb-1"
                  style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 22, textTransform: "uppercase" }}
                >
                  Booked
                </h2>
                <p className="mb-4 text-sm" style={{ color: COLORS.chalkDim }}>
                  Reserved by{" "}
                  <span style={{ color: COLORS.chalk, fontWeight: 500 }}>
                    {bookings[`${activeSlot.courtId}__${activeSlot.hour}`]?.name}
                  </span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={closeSlot}
                    className="flex-1 py-2.5 rounded-md text-sm"
                    style={{ color: COLORS.chalkDim, border: `1px solid ${COLORS.line}` }}
                  >
                    Close
                  </button>
                  <button
                    onClick={cancelBooking}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-md text-sm font-medium"
                    style={{ background: COLORS.red, color: COLORS.chalk, opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? "Canceling…" : "Cancel booking"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {paymentBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.70)" }}
        >
          <div
            className="payment-modal-content relative w-full max-w-4xl rounded-xl p-6"
            style={{
              background: COLORS.panel,
              border: `1px solid ${COLORS.line}`,
              maxHeight: "95vh",
            }}
          >
            {/* Close button - cancellation behavior gets wired next */}
            <button
              onClick={() => {
                if (paymentBooking?.status === "payment_submitted") {
                  setPaymentBooking(null);
                  setPaymentMethod(null);
                } else {
                  cancelPaymentOrder();
                }
              }}
              aria-label="Cancel payment"
              style={{
                position: "absolute",
                top: 14,
                right: 16,
                width: 34,
                height: 34,
                borderRadius: 6,
                background: COLORS.panelAlt,
                border: `1px solid ${COLORS.line}`,
                color: COLORS.chalk,
                fontSize: 20,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.1em",
                color: COLORS.maple,
              }}
            >
              PAYMENT REQUIRED
            </div>

            <h2
              className="mt-1 mb-5"
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontWeight: 600,
                fontSize: 26,
                textTransform: "uppercase",
              }}
            >
              Complete your booking
            </h2>

            <div className="payment-layout grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* LEFT SIDE */}
              <div>
                <div
                  className="rounded-lg p-4 mb-4"
                  style={{
                    background: COLORS.ink,
                    border: `1px solid ${COLORS.line}`,
                  }}
                >
                  <div className="space-y-3 text-sm">

                    <div>
                      <span style={{ color: COLORS.chalkDim }}>
                        Booking reference
                      </span>

                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 17,
                          marginTop: 3,
                        }}
                      >
                        {paymentBooking.booking_reference}
                      </div>
                    </div>

                    <div>
                      <span style={{ color: COLORS.chalkDim }}>
                        Amount to pay
                      </span>

                      <div
                        style={{
                          fontFamily: "'Oswald', sans-serif",
                          fontWeight: 600,
                          fontSize: 28,
                          marginTop: 2,
                        }}
                      >
                        ₱{paymentAmount.toLocaleString()}
                      </div>
                    </div>

                    <div>
                      <span style={{ color: COLORS.chalkDim }}>
                        Status:{" "}
                      </span>

                      <span
                        style={{
                          color:
                            paymentBooking?.status === "payment_submitted"
                              ? COLORS.green
                              : COLORS.orange,
                        }}
                      >
                        {paymentBooking?.status === "payment_submitted"
                          ? "Payment submitted"
                          : "Payment in progress"}
                      </span>
                    </div>

                    {paymentBooking?.status !== "payment_submitted" && (
                      <div>
                        <span style={{ color: COLORS.chalkDim }}>
                          Time remaining:{" "}
                        </span>

                        <span
                          style={{
                            color: COLORS.orange,
                            fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {String(Math.floor(paymentTimeLeft / 60)).padStart(2, "0")}:
                          {String(paymentTimeLeft % 60).padStart(2, "0")}
                        </span>
                      </div>
                    )}

                  </div>
                </div>

                <div
                  className="rounded-lg p-4"
                  style={{
                    background: COLORS.ink,
                    border: `1px solid ${COLORS.line}`,
                  }}
                >
                  <div
                    className="text-xs mb-2"
                    style={{ color: COLORS.chalkDim }}
                  >
                    PAYMENT METHOD
                  </div>

                  <div
                    style={{
                      fontFamily: "'Oswald', sans-serif",
                      fontWeight: 600,
                      fontSize: 22,
                      textTransform: "uppercase",
                    }}
                  >
                    {paymentMethod === "gcash"
                      ? "GCash"
                      : "Bank Transfer"}
                  </div>

                  <p
                    className="mt-3 text-sm"
                    style={{ color: COLORS.chalkDim }}
                  >
                    Pay exactly{" "}
                    <strong style={{ color: COLORS.chalk }}>
                      ₱{paymentAmount.toLocaleString()}
                    </strong>
                    .
                  </p>

                  <p
                    className="mt-2 text-xs"
                    style={{ color: COLORS.orange }}
                  >
                    Complete your payment, then click the button below before the timer expires.
                  </p>
                </div>

                {paymentBooking?.status !== "payment_submitted" && (
                  <button
                    onClick={submitPayment}
                    disabled={saving}
                    className="w-full mt-5 py-3 rounded-md font-medium"
                    style={{
                      background: COLORS.orange,
                      color: COLORS.ink,
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? "SUBMITTING PAYMENT..." : "I HAVE PAID — SUBMIT PAYMENT"}
                  </button>
                )}

                {paymentBooking?.status === "payment_submitted" && (
                  <div className="mt-5">
                    <div
                      className="rounded-lg p-4 mb-3"
                      style={{
                        border: `1px solid ${COLORS.green}`,
                        background: "rgba(63, 166, 107, 0.08)",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "'Oswald', sans-serif",
                          fontWeight: 600,
                          fontSize: 20,
                          color: COLORS.green,
                        }}
                      >
                        PAYMENT SUBMITTED
                      </div>

                      <p
                        className="mt-2 text-sm"
                        style={{ color: COLORS.chalk }}
                      >
                        Your booking is reserved while we verify your payment.
                      </p>

                      <p
                        className="mt-2 text-xs"
                        style={{ color: COLORS.chalkDim }}
                      >
                        You do not need to submit your payment again.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setPaymentBooking(null);
                        setPaymentMethod(null);
        setSelectedSlots([]);
        loadBookings(selectedDate, { silent: true });
      }}
      className="w-full py-3 rounded-md font-medium"
      style={{
        background: COLORS.green,
        color: COLORS.ink,
      }}
    >
      DONE, VIEW SCHEDULE
    </button>
  </div>
)}
              </div>

              {/* RIGHT SIDE */}
              <div
                className="rounded-lg p-4 flex items-center justify-center"
                style={{
                  background: COLORS.ink,
                  border: `1px solid ${COLORS.line}`,
                  minHeight: 390,
                }}
              >
                {paymentBooking?.status === "payment_submitted" ? (
                  <div
                    className="text-center w-full"
                    style={{
                      maxWidth: 360,
                      margin: "0 auto",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 48,
                        marginBottom: 14,
                        color: COLORS.green,
                      }}
                    >
                      ✓
                    </div>

                    <div
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        fontWeight: 600,
                        fontSize: 24,
                        color: COLORS.green,
                      }}
                    >
                      PAYMENT SUBMITTED
                    </div>

                    <p
                      className="mt-3 text-sm"
                      style={{
                        color: COLORS.chalkDim,
                        lineHeight: 1.6,
                      }}
                    >
                      Your payment has been sent for verification.
                      Your selected court schedule remains reserved.
                    </p>

                    <div
                      className="mt-4 rounded-lg p-3"
                      style={{
                        background: COLORS.panel,
                        border: `1px solid ${COLORS.line}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: COLORS.chalkDim,
                          marginBottom: 4,
                        }}
                      >
                        BOOKING REFERENCE
                      </div>

                      <strong>
                        {paymentBooking?.booking_reference}
                      </strong>
                    </div>
                  </div>
                ) : paymentMethod === "gcash" ? (
                  <div className="text-center w-full">
                    <div
                      className="mb-3"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        fontWeight: 600,
                        fontSize: 20,
                      }}
                    >
                      Scan with GCash
                    </div>

                    <img
                      src="/images/gcash-qr.jpg"
                      alt="GCash payment QR code"
                      style={{
                        width: "100%",
                        maxWidth: "320px",
                        maxHeight: "430px",
                        objectFit: "contain",
                        borderRadius: 8,
                        display: "block",
                        margin: "0 auto",
                      }}
                    />

                    <div
                      className="mt-3 text-sm"
                      style={{ color: COLORS.chalkDim }}
                    >
                      Send exactly{" "}
                      <strong style={{ color: COLORS.chalk }}>
                        ₱{paymentAmount.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    <div
                      className="mb-4"
                      style={{
                        fontFamily: "'Oswald', sans-serif",
                        fontWeight: 600,
                        fontSize: 22,
                        textTransform: "uppercase",
                      }}
                    >
                      Bank Transfer
                    </div>

                    <div
                      className="text-sm"
                      style={{ color: COLORS.chalkDim }}
                    >
                      Bank transfer instructions will appear here.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSlots.length > 0 &&
        !bottomCheckoutVisible &&
        !checkoutOpen &&
        !paymentBooking && (
        <div className="mobile-checkout-bar">
          <div className="mobile-checkout-total">
            <span>TOTAL</span>
            <strong>
              ₱{selectedTotal.toLocaleString()}
            </strong>
          </div>

          <button
            onClick={() => setCheckoutOpen(true)}
            className="mobile-checkout-button"
          >
            PROCEED TO PAYMENT
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-md text-sm"
          style={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.line}`, color: COLORS.chalk }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
