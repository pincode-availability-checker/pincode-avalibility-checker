import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  title: {
    type: String,
    required: false,
    default: 'Unknown Product',
  },
  url: {
    type: String,
    required: true,
  },
  platform: {
    type: String,
    required: true,
    enum: ['amazon', 'flipkart', 'unknown'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

// Update the updatedAt timestamp on save
ProductSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
