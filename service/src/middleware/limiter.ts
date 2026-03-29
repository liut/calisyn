import { rateLimit } from 'express-rate-limit'
import { isNotEmptyString } from '../utils/is'

const MAX_REQUEST_PER_HOUR = process.env.MAX_REQUEST_PER_HOUR

const maxCount = (isNotEmptyString(MAX_REQUEST_PER_HOUR) && !Number.isNaN(Number(MAX_REQUEST_PER_HOUR)))
  ? Number.parseInt(MAX_REQUEST_PER_HOUR)
  : undefined // undefined means no rate limiting

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: maxCount,
  statusCode: 200,
  message: async (req, res) => {
    res.send({ status: 'Fail', message: 'Too many request from this IP in 1 hour', data: null })
  },
  // Only apply rate limiting when maxCount is defined
  ...(maxCount === undefined ? { disabled: true } : {}),
})

export { limiter }
