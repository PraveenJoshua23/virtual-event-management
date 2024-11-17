const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/config');
const db = require('../db/inMemoryDb');
const { sendEmail } = require('../utils/email');

router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (db.users.has(email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
   
        const user = {
            email,
            password: hashedPassword,
            name,
            id: Date.now().toString()
        };

        db.users.set(email, user);
        db.userEvents.set(user.id, new Set());

        await sendEmail(
            email,
            'Welcome to Virtual Event Platform',
            `Hi ${name}, your account has been successfully created!`
        );

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error registering user' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = db.users.get(email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'Error during login' });
    }
});

module.exports = router;