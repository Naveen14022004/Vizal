const express = require('express');
const router = express.Router();
const Product = require('./models/Product');
const Order = require('./models/Order');
const redisClient = require('./redisClient');

// POST /sale/order
router.post('/order', async (req, res) => {
    const { user_authentication_token, productId, quantity } = req.body;
    const userId = getUserIdFromToken(user_authentication_token); // Dummy function to extract user ID

    if (quantity > 1) {
        return res.status(400).json({ message: 'Only 1 item can be purchased per customer.' });
    }

    // Check if sale has started
    const product = await Product.findOne({ productId });
    if (new Date() < new Date(product.saleStartTime)) {
        return res.status(400).json({ message: 'Sale has not started yet.' });
    }

    // Check for stock availability
    const lockAcquired = await lock(`product_lock_${productId}`, 5000); // Lock for 5 seconds
    if (!lockAcquired) {
        return res.status(429).json({ message: 'System is busy, please try again.' });
    }

    try {
        const currentStock = product.currentStock;

        if (currentStock < quantity) {
            return res.status(400).json({ message: 'Insufficient stock.' });
        }

        // Check if user has already placed an order
        const existingOrder = await Order.findOne({ userId, productId });
        if (existingOrder) {
            return res.status(400).json({ message: 'Order already placed.' });
        }

        // Deduct stock and create order
        product.currentStock -= quantity;
        await product.save();

        const newOrder = new Order({ userId, productId, quantity, orderStatus: 'success' });
        await newOrder.save();

        res.status(201).json({ message: 'Order placed successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'An error occurred.', error });
    } finally {
        // Release the lock
        await redisClient.del(`product_lock_${productId}`);
    }
});

module.exports = router;
