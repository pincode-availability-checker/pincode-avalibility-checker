import mongoose from 'mongoose';

const AvailabilityLogSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    index: true,
  },
  pincode: {
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['Available', 'Unavailable', "Couldn't verify"],
    index: true,
  },
  deliveryDate: {
    type: String,
    required: false,
    default: null,
  },
  scrapedAt: {
    type: Date,
    default: Date.now,
    index: true,
  }
});

// Composite index to easily query the latest log for a product at a specific pincode
AvailabilityLogSchema.index({ productId: 1, pincode: 1, scrapedAt: -1 });

export const AvailabilityLog = mongoose.models.AvailabilityLog || mongoose.model('AvailabilityLog', AvailabilityLogSchema);
