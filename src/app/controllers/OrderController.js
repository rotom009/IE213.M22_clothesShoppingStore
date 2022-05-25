const Product = require('../models/Product')
const Order = require('../models/Order')
const Cart = require('../models/Cart')

const createOrder = async (req, res) => {
  const userId = req.user

  const { name, phoneNumber, address } = req.body
  if (!name || !phoneNumber || !parseInt(phoneNumber) || !address)
    return res.send('Vui lòng điền đầy đủ và chính xác các thông tin')

  const newAddress = [
    address.city,
    address.district,
    address['sub-district'],
    address.street,
  ].join(', ')

  console.log(userId)

  const cart = await Cart.findOne({ userId })
  if (!cart) {
    return res.send('Giỏ hàng không tồn tại')
  }

  const { cartItems, shippingFee } = cart
  if (!cartItems || cartItems.length < 1) {
    return res.send('Giỏ hàng trống')
  }

  let orderItems = []
  let subtotal = 0

  for (const item of cartItems) {
    const dbProduct = await Product.findOne({ _id: item.productId })
    if (!dbProduct) {
      return res.send(`No product with id: ${item.productId}`)
    }

    const dbSku = dbProduct.getSkuById(item.skuId)
    if (!dbSku) {
      return res.send(`No sku with id: ${item.skuId}`)
    }

    // Check quantity validation
    if (item.quantity > dbSku.quantity || item.quantity < 1) {
      return res.send('Quantity not valid')
    }

    const { name, _id: productId } = dbProduct
    const {
      color: { color_type: color },
      price,
      size: { size_type: size },
    } = dbSku

    const singleOrderItem = {
      quantity: item.quantity,
      name,
      price: price.base * (1 - price.discount),
      image: dbProduct.image[0] || '/images/product-placeholder.png',
      color,
      size,
      product: productId,
    }
    // add item to orderItems list
    orderItems = [...orderItems, singleOrderItem]
    // calculate subtotal
    subtotal += item.quantity * (price.base * (1 - price.discount))

    // Decrease product with sku quantity
    dbSku.quantity -= item.quantity
    await dbProduct.save()
  }

  const total = subtotal + shippingFee

  const order = await Order.create({
    orderItems,
    total,
    subtotal,
    shippingFee,
    user: userId,
    name,
    phoneNumber,
    address: newAddress,
  })

  await cart.clearCart()

  res.redirect('/order/my-order')
}

// Admin only
const getAllOrders = async (req, res) => {
  const orders = await Order.find({})

  res.status(StatusCodes.OK).json({ orders, count: orders.length })
}

const getSingleOrder = async (req, res) => {
  const { id: orderId } = req.params

  const order = await Order.findOne({ _id: orderId })
  if (!order) {
    throw new NotFoundError(`No order with id: ${order}`)
  }

  // TODO: check permission
  // checkPermissions(req.user, order.user)

  res.status(StatusCodes.OK).json({ order })
}

const getCurrentUserOrders = async (req, res) => {
  const userId = req.user
  let orders = await Order.find({ user: userId }).populate('orderItems.product')

  orders = orders.map((order) => order.toObject())

  res.render('orders/my-order', {
    count: orders.length,
    orders,
  })
}

// Admin only
const updateOrder = async (req, res) => {
  const { id: orderId } = req.params
  const { paymentIntentId } = req.body

  const order = await Order.findOne({ _id: orderId })
  if (!order) {
    throw new NotFoundError(`No order with id: ${order}`)
  }

  order.paymentIntentId = paymentIntentId
  order.status = 'paid'
  await order.save()

  res.status(StatusCodes.OK).json({ order })
}

module.exports = {
  getAllOrders,
  getSingleOrder,
  getCurrentUserOrders,
  createOrder,
  updateOrder,
}
