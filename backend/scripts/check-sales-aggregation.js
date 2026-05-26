const mongoose = require('mongoose');

async function run() {
  const uri = "mongodb+srv://hariguptax1_db_user:yaJKUDWTmdFjvNY7@cluster0.xsfv7e3.mongodb.net/whatsapp-store?retryWrites=true&w=majority";
  
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB via Mongoose!");
    const db = mongoose.connection.db;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const now = new Date();

    console.log(`\nRange: ${thirtyDaysAgo.toISOString()} to ${now.toISOString()}`);

    // Query 1: Top online selling products (ProductMetrics)
    const ordersCol = db.collection('orders');
    const onlineTopSelling = await ordersCol.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo, $lt: now },
          status: { $ne: 'cancelled' },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 10 },
    ]).toArray();

    console.log(`\n--- Online Top Selling Products (Last 30 Days) ---`);
    console.log(`Count: ${onlineTopSelling.length}`);
    console.log(JSON.stringify(onlineTopSelling, null, 2));

    // Query 2: Top store walk-in selling products (StoreSales)
    const storeSalesCol = db.collection('storesales');
    const storeTopSelling = await storeSalesCol.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo, $lte: now } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 10 },
    ]).toArray();

    console.log(`\n--- Physical Store Top Selling Products (Last 30 Days) ---`);
    console.log(`Count: ${storeTopSelling.length}`);
    console.log(JSON.stringify(storeTopSelling, null, 2));

    // Query 3: Let's dump all orders since inception to see their dates!
    const allOrders = await ordersCol.find({}).sort({ createdAt: -1 }).limit(5).toArray();
    console.log(`\n--- Most Recent 5 Orders overall in DB ---`);
    allOrders.forEach(o => {
      console.log(`Order #${o.orderNumber} | Date: ${o.createdAt} | Status: ${o.status}`);
    });

  } catch (err) {
    console.error("Error in diagnostic:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
