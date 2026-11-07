const { generarNumerosRifa } = require('../src/services/ticketGenerator');

describe('generación de números de rifa', () => {
  test('asigna números distintos a cada posición secuencial', () => {
    expect(generarNumerosRifa({ cantidad_numeros: 3, digitos: 2, modo: 'secuencial' }, 0))
      .toEqual(['00', '01', '02']);
    expect(generarNumerosRifa({ cantidad_numeros: 3, digitos: 2, modo: 'secuencial' }, 1))
      .toEqual(['03', '04', '05']);
  });

  test('no repite números aleatorios dentro de una misma boleta', () => {
    const numeros = generarNumerosRifa({ cantidad_numeros: 10, digitos: 2, modo: 'aleatorio' });
    expect(new Set(numeros).size).toBe(10);
  });

  test('rechaza cantidades incompatibles con el rango configurado', () => {
    expect(() => generarNumerosRifa({ cantidad_numeros: 11, digitos: 1, modo: 'aleatorio' }))
      .toThrow('supera el rango configurado');
  });
});
