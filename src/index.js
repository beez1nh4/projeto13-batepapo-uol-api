import express from 'express'
import cors from 'cors'
import { MongoClient } from "mongodb";
import dotenv from 'dotenv'
import dayjs from 'dayjs'
import joi from 'joi'

const app = express()
app.use(cors())
app.use(express.json())
dotenv.config()

const nameSchema = joi.object({
  name: joi.string().required()
});

const messageSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid('message', 'private_message').required()
})

const mongoClient = new MongoClient(process.env.MONGO_URI)
let db

try{
await mongoClient.connect();
db = mongoClient.db("dbBatePapo")
} catch( err){
    console.log(err)
}

app.post("/participants", async (req, res) => {
    const {name} = req.body
    const nameFormat = req.body
    const time = dayjs().format('HH:mm:ss')
    const validation = nameSchema.validate(nameFormat, {abortEarly: false})
    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        res.status(422).send(errors);
        return;
      }
    try {
      const nameExists = await db.collection("participants").findOne({ name: name });
      if (nameExists) {
        return res.status(409).send({ message: "Esse nome já existe" });
      }

      await db.collection("participants")
      .insert({
        name,
        lastStatus: Date.now(),
      })
      await db.collection("messages")
      .insert({
        from: name,
        to: 'Todos',
        text: 'entra na sala...',
        type: 'status',
        time: time
      })

      res.status(201).send("Participante cadastrado com sucesso!");
    } catch(err){
      res.status(500).send(err);
    };
})

app.get("/participants", async (req, res) => {
    try{
    const participants = await db.collection("participants")
    .find()
    .toArray()
    
    res.send(participants);
    }
    catch(err) {
      res.status(500).send(err);
    } 

})

app.post("/messages", async (req, res) => {
    const message = req.body
    const {to, text, type} = req.body
    const { user } = req.headers
    const time = dayjs().format('HH:mm:ss')

    const validation = messageSchema.validate(message, {abortEarly: false})
    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        res.status(422).send(errors);
        return;
      }
    
      if (!user) {
        res.sendStatus(422);
        return;
      }

    try{

    const nameExists = await db.collection("participants").findOne({ name: user });
    if (!nameExists) {
      return res.status(404).send({ message: "Esse participante não existe" });
    }

    await db.collection("messages")
    .insert({
      from: user,
      to,
      text,
      type,
      time,
    })
      res.status(201).send("Mensagem cadastrada com sucesso!");
      return
    } catch(err) {
      res.status(500).send(err);
    };
})

app.get("/messages", async (req, res) => {
    let limit  = Number(req.query.limit);
    const { user } = req.headers

    try{

      const nameExists = await db.collection("participants").findOne({ name: user });
      if (!nameExists) {
        return res.status(404).send({ message: "Esse participante não existe" });
      }

    const messages = await db.collection("messages")
    .find({$or: [{"from": user}, {"to": user}, {"type": "message"}, {"type": "status"}]})
    .toArray()
    
    if (limit){
      let messagesSent = messages
      if (limit > messages.length){
        limit = messages.length
      }
      messagesSent.reverse()
      const messagesAux = []
      for (let i =0; i < limit; i++){
        messagesAux.push(messagesSent[i])
      }
      messagesSent = messagesAux.reverse()
      res.send(messagesSent)
      return
    }
    res.send(limit);
    return
    }
    catch (err) {
      console.log(err);
      res.status(500).send(err);
    };
    
})

app.post("/status", async (req, res) => {
    const { user } = req.headers
    
    try{
      const nameExists = await db.collection("participants").findOne({ name: user });
      if (!nameExists) {
        return res.status(404).send({ message: "Esse participante não existe" });
      }
      await db.collection("participants").updateOne({name: user}, {$set: {lastStatus: Date.now()}})
      res.status(200).send("Status atualizado com sucesso");
    } catch (err) {
      res.status(500).send(err);
    }
})

function checkStatus(participant){
  if( Date.now() -  participant.lastStatus > 10000){
    return true
  } else{
    return false
  }
}

async function removeParticipants(){
  const participants = await db.collection("participants").find().toArray()
  const participantsOffline = participants.filter((participant) => checkStatus(participant))
  for (let i =0; i < participantsOffline.length; i++){
    await db.collection("participants").deleteOne({name: participantsOffline[i].name})
    await db.collection("messages")
    .insertOne({
      from: participantsOffline[i].name,
      to: 'Todos',
      text: 'sai da sala',
      type: 'status',
      time: dayjs().format('HH:mm:ss'),
    })
  }
}

setInterval(removeParticipants, 15000)

app.listen(5000, () => 
    console.log("Server running in port: 5000")
)