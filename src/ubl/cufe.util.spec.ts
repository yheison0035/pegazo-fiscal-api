import { createHash } from 'crypto';
import { calcCude, calcCufe, CufeInput } from './cufe.util';

// CUFE/CUDE según Anexo Técnico FE v1.9 (DIAN). Son hashes deterministas: a
// entrada conocida, salida conocida. Cualquier cambio en el orden de la cadena,
// los códigos de impuesto o el formato monetario rompe la validación DIAN y
// estos tests lo detectan antes de salir a producción.
const base: CufeInput = {
  numFac: 'SETP990000001',
  fecFac: '2026-10-28',
  horFac: '10:15:30-05:00',
  valFac: 100000,
  valImpuesto1: 19000,
  valImpuesto2: 0,
  valImpuesto3: 0,
  valTot: 119000,
  nitOFE: '900123456',
  numAdq: '1030123456',
  claveTecnica: 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c',
  ambiente: 2,
};

describe('calcCufe', () => {
  it('vector de regresión fijo (SHA-384 hex, 96 caracteres, minúsculas)', () => {
    const cufe = calcCufe(base);
    expect(cufe).toBe('ad954ff86f2d0385958b85065c688e58cb219ae9b046a2411e0fccddf8cc8796feef32fd02c7ef4bd8d4533d896406f7');
    expect(cufe).toMatch(/^[0-9a-f]{96}$/);
  });

  it('respeta el orden y los códigos del Anexo: NumFac+FecFac+HorFac+ValFac+01+ValImp1+04+ValImp2+03+ValImp3+ValTot+NIT+NumAdq+ClTec+Ambiente', () => {
    const cadena =
      'SETP990000001' + '2026-10-28' + '10:15:30-05:00' + '100000.00' +
      '01' + '19000.00' + '04' + '0.00' + '03' + '0.00' + '119000.00' +
      '900123456' + '1030123456' + base.claveTecnica + '2';
    expect(calcCufe(base)).toBe(createHash('sha384').update(cadena, 'utf8').digest('hex'));
  });

  it('los valores monetarios van con DOS decimales (redondeo determinista)', () => {
    expect(calcCufe({ ...base, valFac: 100000.004 })).toBe(calcCufe(base));
    expect(calcCufe({ ...base, valFac: 100000.01 })).not.toBe(calcCufe(base));
  });

  it('cambiar cualquier campo cambia el CUFE (ambiente, hora, adquiriente, clave)', () => {
    const c = calcCufe(base);
    expect(calcCufe({ ...base, ambiente: 1 })).not.toBe(c);
    expect(calcCufe({ ...base, horFac: '10:15:31-05:00' })).not.toBe(c);
    expect(calcCufe({ ...base, numAdq: '222222222' })).not.toBe(c);
    expect(calcCufe({ ...base, claveTecnica: 'otra' })).not.toBe(c);
  });
});

describe('calcCude (notas y documento POS)', () => {
  it('es la misma fórmula con el PIN del software en la posición de la clave técnica', () => {
    const { claveTecnica, ...sinClave } = base;
    expect(calcCude({ ...sinClave, pin: '12345' })).toBe(calcCufe({ ...base, claveTecnica: '12345' }));
    expect(calcCude({ ...sinClave, pin: '12345' })).not.toBe(calcCufe(base));
  });
});
