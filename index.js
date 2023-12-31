const express = require('express');
const dotenv = require('dotenv').config();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

const VerifyJwt = ((req, res, next) => {

    const authorization = req.headers.authorization
    if (!authorization) {
        return res.status(401).send({ message: 'Unauthorized' })
    }
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded
        next()
    });

})

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollections = client.db('skillDB').collection('users');
        const classCollections = client.db('skillDB').collection('classes');
        const selectedClassCollections = client.db('skillDB').collection('selectedClass');
        const teamCollections = client.db('skillDB').collection('team');
        const commentCollections = client.db('skillDB').collection('comments');

        // jwt
        app.post('/jwt', (req, res) => {
            const user = req.body;
            console.log(user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token })
        })

        // adminVerify

        const VerifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollections.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(401).send({ message: 'Unauthorized' })
            }
            next()
        }

        // instructorVerify

        const VerifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollections.findOne(query)
            if (user?.role !== 'instructor') {
                return res.status(401).send({ message: 'Unauthorized' })
            }
            next()
        }

        // Users 
        app.post('/users', async (req, res) => {
            const user = req.body;
            user.EntryDate = new Date();
            const saveUser = await userCollections.findOne(user);
            if (saveUser) {
                return res.send({ exist: true })
            }
            const result = await userCollections.insertOne(user);
            res.send(result);
        })

        app.post('/selectedClass/:email', async (req, res) => {
            const selectedClass = req.body;
            // console.log(selectedClass.email);
            selectedClass.EntryDate = new Date();
            const query = { email: selectedClass.email };
            const existClass = await selectedClassCollections.find(query).toArray();
            const isExist = existClass.find(ec => ec.classId === selectedClass.classId);
            if (isExist) {
                return res.send({ isExist: true })
            };
            const result = await selectedClassCollections.insertOne(selectedClass);
            res.send(result);
        });

        app.get('/selectedClass/:email', VerifyJwt, async (req, res) => {
            const email = req.params.email;
            // console.log(req.headers.authorization);
            const query = { email: email, payment: false };
            const result = await selectedClassCollections.find(query).sort({ EntryDate: -1 }).toArray();
            res.send(result);
        })

        app.delete('/deleteClass/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassCollections.deleteOne(query);
            res.send(result);
        })

        app.patch('/payment/:id', VerifyJwt, async (req, res) => {
            const id = req.params.id
            const { payment, date, seats, students, timestamp, TransactionId } = req.body;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    payment: payment,
                    date: date,
                    seats: parseInt(seats) - 1,
                    students: parseInt(students) + 1,
                    timestamp: timestamp,
                    TransactionId: TransactionId
                },
            };
            const result = await selectedClassCollections.updateOne(filter, updateDoc)
            res.send(result);
        })

        app.patch('/updateClass/:classId', VerifyJwt, async (req, res) => {
            const id = req.params.classId
            const filter = { _id: new ObjectId(id) }
            const { seats, students } = req.body
            const updateDoc = {
                $set: {
                    seats: parseInt(seats) - 1,
                    students: parseInt(students) + 1,
                },
            };

            const result = await classCollections.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.get('/enrolledClass/:email', VerifyJwt, async (req, res) => {
            const email = req.params.email
            const query = { email: email, payment: true }
            const result = await selectedClassCollections.find(query).sort({ timestamp: -1 }).toArray();
            res.send(result)
        })


        app.post("/create-payment-intent", VerifyJwt, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // Instructros
        app.get('/instructor/:email', VerifyJwt, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            if (req.decoded.email !== email) {
                return res.send({ instructor: false })
            };
            const user = await userCollections.findOne(query);
            const result = { instructor: user?.role === 'instructor' };
            res.send(result);
        })

        app.post('/addNewClass', VerifyJwt, VerifyInstructor, async (req, res) => {
            const addNewClass = req.body;
            addNewClass.price = parseInt(addNewClass.price);
            addNewClass.seats = parseInt(addNewClass.seats);
            addNewClass.students = 0;
            addNewClass.newClass = 'true';
            addNewClass.EntryDate = new Date();
            const result = await classCollections.insertOne(addNewClass);
            res.send(result);
            // console.log(addNewClass);
        })

        app.get('/myClasses/:email', VerifyJwt, VerifyInstructor, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await classCollections.find(query).sort({ EntryDate: -1 }).toArray();
            res.send(result);
        })

        // Admin
        app.get('/admin/:email', VerifyJwt, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            if (req.decoded.email !== email) {
                return res.send({ admin: false })
            }
            const user = await userCollections.findOne(query);
            const result = { admin: user?.role === 'admin' };
            res.send(result);
        })

        app.get('/users', VerifyJwt, VerifyAdmin, async (req, res) => {
            const result = await userCollections.find({}).toArray();
            res.send(result);
        })

        app.get('/instructorNewClass/:newClass', VerifyJwt, VerifyAdmin, async (req, res) => {
            const newClass = req.params.newClass;
            const query = { newClass: newClass };
            const result = await classCollections.find(query).sort({ EntryDate: -1 }).toArray();
            res.send(result);
        })

        app.patch('/makeInstructor/:id', VerifyJwt, VerifyAdmin, async (req, res) => {
            const id = req.params.id;
            const instructor = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateInstructor = {
                $set: {
                    updateRole: instructor.updateRole,
                    role: instructor.role
                }
            };
            const result = await userCollections.updateOne(filter, updateInstructor);
            res.send(result);
        })

        app.patch(`/makeAdmin/:id`, VerifyJwt, VerifyAdmin, async (req, res) => {
            const id = req.params.id;
            const admin = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateAdmin = {
                $set: {
                    updateRole: admin.updateRole,
                    role: admin.role
                }
            }
            const result = await userCollections.updateOne(filter, updateAdmin);
            res.send(result);
        })

        app.patch('/approvedClass/:id', VerifyJwt, VerifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const approdeClass = req.body;
            const updateClass = {
                $set: {
                    status: approdeClass.status
                }
            };
            const result = await classCollections.updateOne(filter, updateClass);
            res.send(result);
        })

        app.patch('/denyClass/:id', VerifyJwt, VerifyAdmin, async (req, res) => {
            const id = req.params.id;
            const denyClass = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateClass = {
                $set: {
                    status: denyClass.status
                }
            };
            const result = await classCollections.updateOne(filter, updateClass);
            res.send(result);
        })

        app.patch('/feedbackClass/:id', VerifyJwt, VerifyAdmin, async (req, res) => {
            const id = req.params.id;
            const updateData = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateFeeback = {
                $set: {
                    feedback: updateData.feedback
                }
            };
            const result = await classCollections.updateOne(filter, updateFeeback);
            res.send(result);
        })


        // common     
        app.get('/instructors', async (req, res) => {
            const result = await userCollections.find({ role: "instructor" }).sort({ students: -1 }).toArray();
            res.send(result);
        })

        // classess 
        app.get('/classes', async (req, res) => {
            const classes = await classCollections.find({}).sort({ students: -1 }).toArray();
            const approvedClasses = classes.filter(signgleClass => signgleClass.status === 'approved');
            res.send(approvedClasses);
        })

        // Team Members
        app.get('/team', async (req, res) => {
            const result = await teamCollections.find({}).toArray();
            res.send(result);
        })

        // Comments
        app.get('/comments', async (req, res) => {
            const result = await commentCollections.find({}).toArray();
            res.send(result);
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