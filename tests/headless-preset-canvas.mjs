import './headless-measurement.mjs'

// CPU fixtures need canvas dimensions/metrics for texture-backed glyph aspect ratios.
// Drawing is deliberately a no-op; native font parity and GPU drawing are checked in the browser.
const noOp=()=>{}
globalThis.document={createElement(tag){
  if(tag!=='canvas')throw Error(`Unexpected DOM request: ${tag}`)
  const canvas=new OffscreenCanvas(1,1)
  canvas.width=1;canvas.height=1
  const context=canvas.getContext('2d')
  for(const name of ['fillRect','clearRect','fillText','beginPath','moveTo','lineTo','stroke','fill','ellipse','arc','save','restore','translate','rotate'])context[name]=noOp
  for(const name of ['createLinearGradient','createRadialGradient'])context[name]=()=>({addColorStop:noOp})
  canvas.getContext=()=>context
  return canvas
}}
