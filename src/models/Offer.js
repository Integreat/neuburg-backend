// @flow

import mongoose from 'mongoose'
import moment from 'moment'

const offerSchema = mongoose.Schema({
  email: {
    type: String,
    lowercase: true,
    required: [true, 'Missing email']
  },
  city: {
    type: String,
    lowercase: true,
    required: [true, 'Missing city']
  },
  expirationDate: {
    type: Date,
    required: [true, 'Missing expiration date']
  },
  confirmed: {
    type: Boolean,
    required: [true, 'Missing confirmed property'],
    default: false
  },
  createdDate: {
    type: Date,
    required: [true, 'Missing created date'],
    default: moment
  },
  hashedToken: {
    type: String,
    required: [true, 'Missing hashed token'],
    unique: true // Create a mongodb unique index
  },
  formData: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'city',
    required: [true, 'Missing form data']
  }
})

// Don't use an arrow function here (because of the 'this' scope)
offerSchema.methods.isExpired = function (): boolean {
  return moment().isAfter(this.expirationDate)
}

export default mongoose.model('Offer', offerSchema)
