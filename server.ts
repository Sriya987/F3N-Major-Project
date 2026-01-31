
/**
 * BACKEND SERVER (Node.js + Express + MongoDB)
 * Includes Auth, Patient and Doctor collection support.
 */
import express from 'express';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import cors from 'cors';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const port = 3001;

// Fix: Use 'any' casting to resolve type mismatches with express middleware overloads (Error in server.ts on line 13 & 14)
app.use(cors() as any);
app.use(express.json() as any);

// Get MongoDB URI from environment variable
const uri = process.env.MONGODB_URI ;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await client.connect();
    const database = client.db("F3N");
    const notesCollection = database.collection("soap_notes");
    const patientsCollection = database.collection("Patient");
    const doctorsCollection = database.collection("Doctor");

    console.log("✅ Successfully connected to MongoDB Atlas!");

    // HEALTH CHECK
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', database: 'connected' });
    });

    // AUTH ENDPOINTS
    app.post('/api/doctors/login', async (req, res) => {
      console.log(`Login attempt for doctor: ${req.body.email}`);
      const { email, password } = req.body;
      const doctor = await doctorsCollection.findOne({ email, password });
      if (doctor) {
        const { password: _, ...rest } = doctor;
        res.json(rest);
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });

    app.post('/api/patients/login', async (req, res) => {
      console.log(`Login attempt for patient: ${req.body.email}`);
      const { email, password } = req.body;
      const patient = await patientsCollection.findOne({ email, password });
      if (patient) {
        const { password: _, ...rest } = patient;
        res.json(rest);
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });

    // DOCTOR REGISTER
    app.post('/api/doctors', async (req, res) => {
      console.log(`Registering new doctor: ${req.body.email}`);
      const doctor = req.body;
      const existing = await doctorsCollection.findOne({ email: doctor.email });
      if (existing) return res.status(400).json({ error: 'Email already exists' });
      
      const count = await doctorsCollection.countDocuments();
      doctor.id = `DR${(count + 1).toString().padStart(3, '0')}`;
      const result = await doctorsCollection.insertOne(doctor);
      console.log(`Doctor created with ID: ${doctor.id}`);
      res.status(201).json({ ...doctor, _id: result.insertedId });
    });

    // NOTES ENDPOINTS
    app.get('/api/notes', async (req, res) => {
      const { patientId } = req.query;
      const filter = patientId ? { patientId } : {};
      const notes = await notesCollection.find(filter).sort({ timestamp: -1 }).toArray();
      res.json(notes);
    });

    app.post('/api/notes', async (req, res) => {
      console.log(`Saving new SOAP note for patient: ${req.body.patientName}`);
      const note = req.body;
      const result = await notesCollection.insertOne(note);
      console.log(`Note saved successfully with _id: ${result.insertedId}`);
      res.status(201).json({ ...note, _id: result.insertedId });
    });

    // PATIENTS ENDPOINTS
    app.get('/api/patients', async (req, res) => {
      const query: any = {};
      if (req.query.name) query.name = { $regex: req.query.name, $options: 'i' };
      if (req.query.id) query.id = req.query.id;
      if (req.query.email) query.email = req.query.email;
      
      const patients = await patientsCollection.find(query).toArray();
      res.json(patients);
    });

    app.post('/api/patients', async (req, res) => {
      console.log(`Registering new patient: ${req.body.name}`);
      const patient = req.body;
      if (!patient.id) {
        const count = await patientsCollection.countDocuments();
        patient.id = `P${(count + 1).toString().padStart(3, '0')}`;
      }
      patient.status = 'pending';
      patient.firstVisitDate = new Date().toISOString().split('T')[0];
      const result = await patientsCollection.insertOne(patient);
      console.log(`Patient record created with ID: ${patient.id}`);
      res.status(201).json({ ...patient, _id: result.insertedId });
    });

    app.patch('/api/patients/:id', async (req, res) => {
      const { id } = req.params;
      const updates = req.body;
      console.log(`Updating patient profile: ${id}`);
      await patientsCollection.updateOne({ id }, { $set: { ...updates, status: 'completed' } });
      const updated = await patientsCollection.findOne({ id });
      res.json(updated);
    });

    app.listen(port, () => {
      console.log(`🚀 Backend running at http://localhost:${port}`);
      console.log(`📡 Point your frontend API_BASE to this address.`);
    });

  } catch (err) {
    console.error("❌ Failed to connect to MongoDB Atlas:", err);
    process.exit(1);
  }
}

run().catch(console.dir);
