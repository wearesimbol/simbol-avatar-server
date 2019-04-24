const hexRgb = require('hex-rgb')
const srgbConversion = require('srgb-logarithmic-and-linear-colour-conversion')
const gltfPipeline = require('gltf-pipeline')
const gltfToGlb = gltfPipeline.gltfToGlb
const glbOptions = {
	compressDracoMeshes: true,
	dracoOptions: {
		compressionLevel: 10
	}
}

const express = require('express')
const compression = require('compression')
const LRUCache = require('mnemonist/lru-cache')
const cache = new LRUCache(50)
const app = express()
const port = 4000

// From sRGB to value used in GLTF
function srgb2linear(rgba) {
	return rgba.map((c) => srgbConversion.logToLin(c))
}

// From value used in GLTF to sRGB
// function linear2srgb(rgba) {
// 	return rgba.map((c) => srgbConversion.linTolog(c))
// }

function normalizeParams(params) {
	const keys = Object.keys(params).sort()
	const normalizeObject = {}
	for (const key of keys) {
		if (isValidColor(params[key])) {
			normalizeObject[key.toLowerCase()] = params[key]
		}
	}
    return normalizeObject
}

function isValidColor(hexColor) {
	hexColor = hexColor.replace('#', '')
	return !!SUPPORTED_COLORS.includes(hexColor.toLowerCase())
}

function generateModel(params) {
	const gltfModel = JSON.parse(JSON.stringify(model))
	gltfModel.materials = gltfModel.materials.map((material) => {
		const materialName = material.name.toLowerCase()
		if (params[materialName]) {
			const newColorHex = params[materialName].toLowerCase().replace(/^#/, '')
			if (isValidColor(newColorHex)) {
				const newColorRgb = hexRgb(newColorHex, {format: 'array'})
				const newColor = srgb2linear(newColorRgb)
				material.pbrMetallicRoughness.baseColorFactor = newColor
			}
			return material
		} else {
			return material
		}
	})

	return gltfModel
}

function gltf2glb(gltfModel) {
	return gltfToGlb(gltfModel, glbOptions)
		.then((results) => results.glb)
}

const SUPPORTED_COLORS = [
	'#F7F6F5',
	'#5399ba',
	'#F9D656',
	'#E2653F',
	'#6FC47B',
	'#9A865D',
	'#545454',
	'#0B1821'
]

const model = require('./avatar.json')

app.use(function(req, res, next) {
	for (const key in req.query) { 
		const lowerCase = key.toLowerCase()
		if (lowerCase !== key) {
			req.query[lowerCase] = req.query[key]
			delete req.query[key]
		}
	}
	next()
})

app.use((req, res, next) => {
	res.setHeader("Cache-Control", "public, s-maxage=31536000, max-age=604800, stale-while-revalidate=604800, stale-if-error=604800")
	if (req.path.includes('.gltf')) {
		res.setHeader("Content-Type", 'model/gltf+json')
	} else if (req.path.includes('.glb')) {
		res.setHeader("Content-Type", 'model/gltf-binary')
	}
	next()
})

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*")
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
	next()
})

app.use(compression({ level: 9 }))

app.get('/avatar.glb', (req, res) => {
	const params = normalizeParams(req.query)
	const paramsString = JSON.stringify(params)
	console.log(paramsString)
	if (cache.has(paramsString)) {
		const model = cache.get(paramsString)
		console.log('cached')
		res.send(model)
	} else {
		const gltfModel = generateModel(params)
		gltf2glb(gltfModel)
		.then((model) => {
			cache.set(paramsString, model)
			console.log('fresh')
			res.send(model)
		})
	}
})

app.use(function (req, res, next) {
	res.status(404).send("Sorry can't find that!")
})

app.use(function (err, req, res, next) {
	console.error(err.stack)
	res.status(500).send('Something broke!')
})

app.listen(port, () => {
	console.log(`Listening on port ${port}`)
})
