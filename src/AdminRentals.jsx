import React, { useEffect, useRef, useState } from "react";
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

export default function AdminRentals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [sportType, setSportType] = useState("pickleball");
  const [imageFile, setImageFile] = useState(null);

  const fileInputRef = useRef(null);

  const loadRentals = async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("rental_items")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setItems(data || []);
    } catch (error) {
      console.error("Could not load rentals:", error);
      setMessage(error.message || "Could not load rental items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRentals();
  }, []);

  const addRental = async (event) => {
    event.preventDefault();

    if (saving) return;

    const cleanName = name.trim();
    const numericPrice = Number(price);

    if (!cleanName) {
      setMessage("Rental name is required.");
      return;
    }

    if (
      price === "" ||
      !Number.isFinite(numericPrice) ||
      numericPrice < 0
    ) {
      setMessage("Please enter a valid rental price.");
      return;
    }

    if (!imageFile) {
      setMessage("Please choose a rental image.");
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(imageFile.type)) {
      setMessage("Image must be JPG, PNG, or WEBP.");
      return;
    }

    if (imageFile.size > 5 * 1024 * 1024) {
      setMessage("Image must be 5 MB or smaller.");
      return;
    }

    setSaving(true);
    setMessage("");

    let uploadedPath = null;

    try {
      const extension =
        imageFile.name.split(".").pop()?.toLowerCase() || "jpg";

      const safeName = cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      uploadedPath =
        `${sportType}/` +
        `${Date.now()}-${safeName}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("rental-images")
        .upload(uploadedPath, imageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("rental-images")
        .getPublicUrl(uploadedPath);

      const imageUrl = publicUrlData.publicUrl;

      const { error: insertError } = await supabase
        .from("rental_items")
        .insert({
          name: cleanName,
          price: Math.round(numericPrice),
          sport_type: sportType,
          image_url: imageUrl,
          image_path: uploadedPath,
          is_active: true,
        });

      if (insertError) throw insertError;

      setName("");
      setPrice("");
      setSportType("pickleball");
      setImageFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setMessage("Rental item added.");
      await loadRentals();
    } catch (error) {
      console.error("Could not add rental:", error);

      if (uploadedPath) {
        await supabase.storage
          .from("rental-images")
          .remove([uploadedPath]);
      }

      setMessage(error.message || "Could not add rental item.");
    } finally {
      setSaving(false);
    }
  };

  const toggleRental = async (item) => {
    setMessage("");

    try {
      const { error } = await supabase
        .from("rental_items")
        .update({
          is_active: !item.is_active,
        })
        .eq("id", item.id);

      if (error) throw error;

      await loadRentals();
    } catch (error) {
      console.error("Could not update rental:", error);
      setMessage(error.message || "Could not update rental.");
    }
  };

  const deleteRental = async (item) => {
    const confirmed = window.confirm(
      `Delete "${item.name}" from the rental catalog?`
    );

    if (!confirmed) return;

    setMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("rental_items")
        .delete()
        .eq("id", item.id);

      if (deleteError) throw deleteError;

      if (item.image_path) {
        const { error: storageError } = await supabase.storage
          .from("rental-images")
          .remove([item.image_path]);

        if (storageError) {
          console.error(
            "Rental deleted, but image cleanup failed:",
            storageError
          );
        }
      }

      setMessage("Rental item deleted.");
      await loadRentals();
    } catch (error) {
      console.error("Could not delete rental:", error);
      setMessage(error.message || "Could not delete rental.");
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            color: COLORS.orange,
            fontSize: 11,
            letterSpacing: "0.12em",
            marginBottom: 4,
          }}
        >
          RENTAL MANAGEMENT
        </div>

        <h2 style={{ margin: 0, fontSize: 26 }}>
          Rental Catalog
        </h2>

        <p
          style={{
            color: COLORS.chalkDim,
            marginTop: 6,
            marginBottom: 0,
          }}
        >
          Add equipment that customers can include with their booking.
        </p>
      </div>

      {message && (
        <div
          style={{
            marginBottom: 18,
            padding: "12px 14px",
            borderRadius: 7,
            background: COLORS.panelAlt,
            border: `1px solid ${COLORS.line}`,
            color: COLORS.chalk,
          }}
        >
          {message}
        </div>
      )}

      <form
        onSubmit={addRental}
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 10,
          padding: 20,
          marginBottom: 28,
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          Add Rental
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: COLORS.chalkDim,
                marginBottom: 6,
              }}
            >
              RENTAL NAME
            </label>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pickleball Paddle"
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.line}`,
                background: COLORS.ink,
                color: COLORS.chalk,
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: COLORS.chalkDim,
                marginBottom: 6,
              }}
            >
              PRICE
            </label>

            <input
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="100"
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.line}`,
                background: COLORS.ink,
                color: COLORS.chalk,
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: COLORS.chalkDim,
                marginBottom: 6,
              }}
            >
              CATEGORY
            </label>

            <select
              value={sportType}
              onChange={(e) => setSportType(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.line}`,
                background: COLORS.ink,
                color: COLORS.chalk,
              }}
            >
              <option value="pickleball">
                Pickleball
              </option>

              <option value="basketball">
                Basketball
              </option>

              <option value="both">
                Both Sports
              </option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: COLORS.chalkDim,
                marginBottom: 6,
              }}
            >
              PICTURE
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) =>
                setImageFile(e.target.files?.[0] || null)
              }
              style={{
                width: "100%",
                color: COLORS.chalkDim,
              }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: 18,
            padding: "11px 18px",
            borderRadius: 6,
            border: `1px solid ${COLORS.orange}`,
            background: COLORS.orange,
            color: COLORS.ink,
            fontWeight: 700,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "ADDING..." : "ADD RENTAL"}
        </button>
      </form>

      <div>
        <h3 style={{ marginBottom: 16 }}>
          Current Rentals
        </h3>

        {loading ? (
          <div style={{ color: COLORS.chalkDim }}>
            Loading rentals...
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              color: COLORS.chalkDim,
              padding: 20,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 8,
            }}
          >
            No rental items yet.
          </div>
        ) : (
          <div
            style={{
                display: "grid",
                gridTemplateColumns:
                "repeat(auto-fill, minmax(260px, 310px))",
                gap: 18,
                justifyContent: "start",
            }}
            >
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                    overflow: "hidden",
                    background: COLORS.panel,
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 12,
                    opacity: item.is_active ? 1 : 0.55,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                }}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={{
                      width: "100%",
                      height: 160,
                      objectFit: "cover",
                      display: "block",
                      background: COLORS.panelAlt,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: 180,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: COLORS.panelAlt,
                      color: COLORS.chalkDim,
                    }}
                  >
                    NO IMAGE
                  </div>
                )}

                <div style={{ padding: 16 }}>
                    <div
                        style={{
                            display: "inline-block",
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            color: COLORS.orange,
                            background: "rgba(232, 89, 43, 0.10)",
                            border: "1px solid rgba(232, 89, 43, 0.25)",
                            textTransform: "uppercase",
                        }}
                        >
                        {item.sport_type}
                    </div>

                  <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        marginTop: 10,
                        marginBottom: 16,
                    }}
                    >
                    <h3
                        style={{
                        margin: 0,
                        fontSize: 18,
                        }}
                    >
                        {item.name}
                    </h3>

                    <strong
                        style={{
                        fontSize: 18,
                        whiteSpace: "nowrap",
                        }}
                    >
                        ₱{formatMoney(item.price)}
                    </strong>
                    </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRental(item)}
                      style={{
                        flex: 1,
                        padding: "9px 10px",
                        borderRadius: 6,
                        border: `1px solid ${COLORS.line}`,
                        background: COLORS.panelAlt,
                        color: item.is_active
                          ? COLORS.green
                          : COLORS.chalkDim,
                        cursor: "pointer",
                      }}
                    >
                      {item.is_active
                        ? "ACTIVE"
                        : "INACTIVE"}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteRental(item)}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 6,
                        border: `1px solid ${COLORS.red}`,
                        background: "transparent",
                        color: COLORS.red,
                        cursor: "pointer",
                      }}
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}