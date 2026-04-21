const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Donation must belong to a user']
  },
  country: {
    type: String,
    required: [true, 'Please specify the country']
  },
  state: {
    type: String,
    required: [true, 'Please specify the state']
  },
  city: {
    type: String,
    required: [true, 'Please specify the city']
  },
  category: {
    type: String,
    required: [true, 'Please specify the donation category'],
    enum: {
      values: ['clothes', 'money', 'food', 'medicine', 'water', 'other', 'medicines', 'others'], // Add plurals just in case
      message: '{VALUE} is not a supported donation category'
    }
  },
  description: {
    type: String,
    required: [true, 'Please provide a description of the donation'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  quantity: {
    type: Number,
    required: [true, 'Please specify the quantity'],
    min: [1, 'Quantity must be at least 1']
  },
  unit: {
    type: String
  },
  location: {
    address: {
      type: String,
      required: [true, 'Please provide a pickup/drop-off location']
    },
    city: String, // Kept for backwards compatibility but top-level city is preferred
    state: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  contactDetails: {
    type: String,
    required: [true, 'Please provide contact details']
  },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Assigned', 'In Process', 'In-Progress', 'Completed', 'Rejected', 'Rejected by Volunteer', 'Expired'],
    default: 'Pending'
  },
  assignedNGO: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedVolunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  volunteerFeedback: {
    type: String,
    trim: true
  },
  assignmentDate: {
    type: Date
  },
  volunteerDetails: {
    name: { type: String },
    contact: { type: String },
    expectedTime: { type: Date }
  },
  flagged: {
    type: Boolean,
    default: false
  },
  flaggedAt: {
    type: Date
  },
  adminFeedback: {
    type: String
  },
  acceptedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for common queries
donationSchema.index({ userId: 1 });
donationSchema.index({ status: 1 });
donationSchema.index({ category: 1 });
donationSchema.index({ assignedNGO: 1 });
donationSchema.index({ flagged: 1 });

module.exports = mongoose.model('Donation', donationSchema);
