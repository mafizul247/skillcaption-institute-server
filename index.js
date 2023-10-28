const express = require('express');
const dotenv = require('dotenv').config();
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dv6fk5d.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const userCollections = client.db('skillDB').collection('users');
        const classCollections = client.db('skillDB').collection('classes');

        // User Collections 
        app.get('/users', async (req, res) => {
            const result = await userCollections.find({}).toArray();
            res.send(result);
        })

        // Instructros
        app.get('/instructors', async (req, res) => {
            const result = await userCollections.find({ role: "instructor" }).sort({ students: -1 }).toArray();
            res.send(result);
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const saveUser = await userCollections.findOne(user);
            if (saveUser) {
                return res.send({ exist: true })
            }
            const result = await userCollections.insertOne(user);
            res.send(result)
        })

        // classess 
        app.get('/classes', async (req, res) => {
            const classes = await classCollections.find({}).sort({ students: -1 }).toArray();
            const approvedClasses = classes.filter(signgleClass => signgleClass.status === 'approved');
            res.send(approvedClasses);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Skillcaption Inistitue Running')
})

app.listen(port, () => {
    console.log(`Skillcaption Inistitue Running port is running - ${port}`)
})