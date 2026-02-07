export function computeAdjustedPrice(
  oldPrice: number,
  mode: "PCT" | "FIXED",
  direction: "INCREASE" | "DECREASE",
  value: number,
): number {
  let newPrice: number;

  if (mode === "PCT") {
    if (direction === "INCREASE") {
      newPrice = oldPrice * (1 + value / 100);
    } else {
      newPrice = oldPrice * (1 - value / 100);
    }
  } else {
    if (direction === "INCREASE") {
      newPrice = oldPrice + value;
    } else {
      newPrice = oldPrice - value;
    }
  }

  newPrice = Math.round(newPrice * 100) / 100;

  if (newPrice < 0) {
    throw new Error("Adjusted price cannot be negative");
  }

  return newPrice;
}
