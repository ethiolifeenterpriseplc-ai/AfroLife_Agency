export function propertyOfferTerms(property) {
  const terms = [];
  if (property.listing_mode !== 'rent' && property.sale_price != null) {
    terms.push({ type: 'sale', amount: Number(property.sale_price) });
  }
  if (property.listing_mode !== 'sale') {
    const rents = (property.units ?? [])
      .map((unit) => Number(unit.rent))
      .filter((rent) => Number.isFinite(rent) && rent > 0);
    terms.push({
      type: 'rent',
      amount: rents.length ? Math.min(...rents) : null,
      period: property.rent_period ?? 'month',
    });
  }
  return terms;
}
