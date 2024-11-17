const express = require('express');
const { PORT } = require('./config/config');

// Import routes
const authRoutes = require('./routes/auth.routes');
const eventRoutes = require('./routes/event.routes');
const userRoutes = require('./routes/user.routes');

const app = express();
app.use(express.json());

// Route middlewares
app.use('/auth', authRoutes);
app.use('/events', eventRoutes);
app.use('/user', userRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});