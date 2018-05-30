// @flow

import {Router} from 'express'
import type {$Request, $Response, NextFunction} from 'express'
import {body, param, validationResult} from 'express-validator/check'
import {matchedData} from 'express-validator/filter'
import {TOKEN_LENGTH} from '../utils/createToken'
import HttpStatus from 'http-status-codes'
import OfferService from '../services/OfferService'
import Offer from '../models/Offer'

const validateMiddleware = (request: $Request, response: $Response, next: NextFunction) => {
  const errors = validationResult(request)
  if (!errors.isEmpty()) {
    response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({errors: errors.mapped()})
  } else {
    next()
  }
}

export default ({offerService}: { offerService: OfferService }): Router => {
  const router = new Router()

  router.get('/getAll',
    async (request: $Request, response: $Response): Promise<void> => {
      try {
        const queryResult = await offerService.getAllOffers()
        response.json(queryResult)
      } catch (e) {
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(e)
      }
    })

  router.get('/', async (request: $Request, response: $Response): Promise<void> => {
    try {
      const offers = await offerService.getActiveOffers(request.city)
      offers.forEach((offer: Offer): Offer => offerService.fillAdditionalFieds(offer, request.city))
      response.json(offers)
    } catch (e) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(e)
    }
  })

  router.put('/',
    body('email').isEmail().trim().normalizeEmail(),
    body('duration').isInt().toInt().custom((value: number): boolean => [3, 7, 14, 30].includes(value)),
    body('formData').exists(),
    body('agreedToDataProtection').isBoolean().toBoolean().custom((value: boolean): boolean => value),
    validateMiddleware,
    async (request: $Request, response: $Response): Promise<void> => {
      const {email, formData, duration} = matchedData(request)
      try {
        const token = await offerService.createOffer(request.city, email, formData, duration)
        response.status(HttpStatus.CREATED).json(token)
      } catch (e) {
        console.error(e)
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(e)
      }
    }
  )

  router.post(`/:token/confirm`,
    param('token').isHexadecimal().isLength(TOKEN_LENGTH),
    validateMiddleware,
    async (request: $Request, response: $Response): Promise<void> => {
      try {
        const {token} = matchedData(request)
        const offer = await offerService.getOfferByToken(token)

        if (!offer) {
          response.status(HttpStatus.NOT_FOUND).json('No such offer')
        } else if (offer.isExpired() || offer.deleted) {
          response.status(HttpStatus.GONE).json('Offer not available')
        } else {
          await offerService.confirmOffer(offer, token)
          response.status(HttpStatus.OK).end()
        }
      } catch (e) {
        console.error(e)
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(e)
      }
    }
  )

  router.post(`/:token/extend`,
    param('token').isHexadecimal().isLength(TOKEN_LENGTH),
    body('duration').isInt().toInt().custom((value: number): boolean => [3, 7, 14, 30].includes(value)),
    validateMiddleware,
    async (request: $Request, response: $Response): Promise<void> => {
      try {
        const {token, duration} = matchedData(request)
        const offer = await offerService.getOfferByToken(token)

        if (!offer) {
          response.status(HttpStatus.NOT_FOUND).json('No such offer')
        } else if (offer.deleted || !offer.confirmed) {
          response.status(HttpStatus.BAD_REQUEST).json('Offer not available')
        } else {
          await offerService.extendOffer(offer, duration, token)
          response.status(HttpStatus.OK).end()
        }
      } catch (e) {
        console.error(e)
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(e)
      }
    }
  )

  router.delete(`/:token`,
    param('token').isHexadecimal().isLength(TOKEN_LENGTH),
    validateMiddleware,
    async (request: $Request, response: $Response): Promise<void> => {
      try {
        const {token} = matchedData(request)
        const offer = await offerService.getOfferByToken(token)

        if (!offer) {
          response.status(HttpStatus.NOT_FOUND).json('No such offer')
        } else if (offer.deleted) {
          response.status(HttpStatus.BAD_REQUEST).json('Already deleted')
        } else {
          await offerService.deleteOffer(offer)
          response.status(HttpStatus.OK).end()
        }
      } catch (e) {
        console.error(e)
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(e)
      }
    }
  )

  return router
}
