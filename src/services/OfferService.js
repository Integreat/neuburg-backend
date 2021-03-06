// @flow

import type {Config} from '../Config'
import moment from 'moment'
import Offer from '../models/Offer'
import hash from '../utils/hash'
import createToken from '../utils/createToken'
import MailService from './MailService'
import forms from '../models/forms'
import UserAction, {
  ACTION_ACTIVELY_DELETED,
  ACTION_CONFIRMED,
  ACTION_CREATED,
  ACTION_EXTENDED,
  ACTION_GET
} from '../models/UserAction'

export default class OfferService {
  config: Config

  constructor (config: Config) {
    this.config = config
  }

  async createOffer (
    city: string,
    email: string,
    formData: mixed,
    duration: number
  ): Promise<string> {
    const token = createToken()

    const {FormModel} = forms[city]
    const form = new FormModel(formData)

    const offer = new Offer({
      email: email,
      city: city,
      expirationDate: moment().add(duration, 'days'),
      hashedToken: hash(token),
      formData: form
    })

    await form.save()
    await offer.save()

    const mailService = new MailService(this.config.smtp)
    await mailService.sendRequestConfirmationMail(offer, token)

    new UserAction({city, action: ACTION_CREATED}).save()

    return token
  }

  getAllOffers (): Promise<Array<Offer>> {
    return Offer.find()
      .populate({path: 'formData', select: '-_id -__v'})
      .lean()
      .exec()
  }

  getAllForms (city: string): Promise<Array<mixed>> {
    const {FormModel} = forms[city]
    return FormModel.find()
      .lean()
      .exec()
  }

  async getActiveOffers (city: string): Promise<Array<Offer>> {
    const offers = await Offer.find()
      .select('-_id -__v -confirmed -expirationDate -hashedToken')
      .where('city')
      .equals(city)
      .where('expirationDate')
      .gt(moment())
      .where('confirmed')
      .equals(true)
      .populate({path: 'formData', select: '-_id -__v'})
      .lean()
      .exec()

    // Can't exclude the city in the projection because of populate
    offers.forEach(offer => delete offer.city)

    new UserAction({city, action: ACTION_GET}).save()

    return offers
  }

  fillAdditionalFieds (offer: Offer, city: string): Offer {
    return forms[city].setAdditionalFields ? forms[city].setAdditionalFields(offer) : offer
  }

  async getOfferByToken (token: string): Offer {
    return Offer.findOne()
      .where('hashedToken')
      .equals(hash(token))
      .populate({path: 'formData'})
      .lean()
      .exec()
  }

  async findByIdAndUpdate (id: string, values: {}): Offer {
    await Offer.findByIdAndUpdate(id, values).exec()
    return Offer.findById(id).exec()
  }

  async confirmOffer (offer: Offer, token: string): Promise<void> {
    if (!offer.confirmed) {
      offer = await this.findByIdAndUpdate(offer._id, {confirmed: true})
      const mailService = new MailService(this.config.smtp)
      await mailService.sendConfirmationMail(offer, token)

      new UserAction({city: offer.city, action: ACTION_CONFIRMED}).save()
    }
  }

  async extendOffer (
    offer: Offer,
    duration: number,
    token: string
  ): Promise<void> {
    const newExpirationDate = moment().add(duration, 'days')

    offer = await this.findByIdAndUpdate(offer._id, {expirationDate: newExpirationDate})
    const mailService = new MailService(this.config.smtp)
    await mailService.sendExtensionMail(offer, token)

    new UserAction({city: offer.city, action: ACTION_EXTENDED}).save()
  }

  async deleteOffer (offer: Offer, token: string, city: string): Promise<void> {
    const {FormModel} = forms[city]
    await FormModel.findByIdAndDelete(offer.formData._id).exec()
    await Offer.findOneAndDelete()
      .where('hashedToken')
      .equals(hash(token))
      .exec()
    const mailService = new MailService(this.config.smtp)
    await mailService.sendDeletionMail(offer)
    new UserAction({city, action: ACTION_ACTIVELY_DELETED}).save()
  }
}
