const mongoose = require('mongoose');

async function run() {
  const uri = "mongodb+srv://hariguptax1_db_user:yaJKUDWTmdFjvNY7@cluster0.xsfv7e3.mongodb.net/whatsapp-store?retryWrites=true&w=majority";
  
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB via Mongoose!");
    const db = mongoose.connection.db;

    const collections = await db.listCollections().toArray();
    console.log("Collections in DB:", collections.map(c => c.name));

    const ordersCol = db.collection('orders');
    const storeSalesCol = db.collection('storesales');
    const productsCol = db.collection('products');
    const auditLogsCol = db.collection('auditlogs');
    const chatSessionsCol = db.collection('chatsessions');

    const ordersCount = await ordersCol.countDocuments();
    console.log(`\nTotal Orders in DB: ${ordersCount}`);
    if (ordersCount > 0) {
      const recentOrder = await ordersCol.findOne({}, { sort: { createdAt: -1 } });
      console.log(`Most recent order date: ${recentOrder.createdAt}`);
      console.log(`Most recent order details: ${JSON.stringify(recentOrder)}`);
    }

    const salesCount = await storeSalesCol.countDocuments();
    console.log(`\nTotal Physical Store Sales in DB: ${salesCount}`);
    if (salesCount > 0) {
      const recentSale = await storeSalesCol.findOne({}, { sort: { createdAt: -1 } });
      console.log(`Most recent store sale date: ${recentSale.createdAt}`);
      console.log(`Most recent store sale details: ${JSON.stringify(recentSale)}`);
    }

    const productsCount = await productsCol.countDocuments();
    console.log(`\nTotal Products in DB: ${productsCount}`);

    const loginsCount = await auditLogsCol.countDocuments({ action: 'admin.login' });
    console.log(`\nTotal Admin Logins in DB: ${loginsCount}`);

    const chatSessionsCount = await chatSessionsCol.countDocuments();
    console.log(`\nTotal Chat Sessions in DB: ${chatSessionsCount}`);

  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
