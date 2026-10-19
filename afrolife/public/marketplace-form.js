export function marketplaceListingPayload(values) {
  const payload = { ...values, territory_id: Number(values.territory_id) };
  if (!payload.seller_user_id) delete payload.seller_user_id;
  if (payload.price) payload.price = Number(payload.price);
  else delete payload.price;
  if (payload.transaction_mode !== 'rental' || !payload.rent_period) delete payload.rent_period;
  if (!payload.condition) delete payload.condition;
  return payload;
}
