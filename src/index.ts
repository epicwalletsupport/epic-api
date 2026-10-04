import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { errorMiddleware } from './middleware/error.middleware'
import { adminRoutes } from './routes/admin.routes'
import { authRoutes } from './routes/auth.routes'
import { cartRoutes } from './routes/cart.routes'
import { orderRoutes } from './routes/order.routes'
import { paymentRoutes } from './routes/payment.routes'
import { productRoutes } from './routes/product.routes'
import { sellerRoutes } from './routes/seller.routes'
import type { AppVariables, Env } from './types/env'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

app.use('*', errorMiddleware)
app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
)

app.get('/health', (c) => c.json({ ok: true, service: 'epic-api' }))

const apiRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>()
apiRoutes.route('/auth', authRoutes)
apiRoutes.route('/products', productRoutes)
apiRoutes.route('/cart', cartRoutes)
apiRoutes.route('/orders', orderRoutes)
apiRoutes.route('/payments', paymentRoutes)
apiRoutes.route('/payment', paymentRoutes)
apiRoutes.route('/admin', adminRoutes)
apiRoutes.route('/seller', sellerRoutes)

app.route('/', apiRoutes)
app.route('/api', apiRoutes)

export default app
