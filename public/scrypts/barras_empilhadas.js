Chart.register(ChartDataLabels);

const METAS = {
  'Nuvemshop Armer': 268400,
  'Nuvemshop Koala': 118800,
  'Nuvemshop Zarcon': 72600,
  'Nuvemshop Distribuidora Koala': 4400,
  'Nuvemshop ATV': 96800
};

const CORES = {
  realizado: '#2ecc71',
  projecao: 'rgba(52, 152, 219, 0.5)',
  restante: '#e5e5e5'
};

function formatarValor(valor) {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

async function carregarDadosBarras() {
  try {
    const res = await fetch('https://metas-koala.onrender.com/cache_detalhes_atualizado.json');
    const json = await res.json();
    const notas = Array.isArray(json) ? json : Object.values(json);

    const realizadoPorLoja = {};

    notas.forEach(nota => {
      const dataNota = nota?.data;
      if (!dataNota || dataNota.tipo !== 1) return;

      const loja = typeof dataNota.loja === 'string' ? dataNota.loja.trim() : '';
      if (!loja) return;

      const dataEmissao = new Date(dataNota.dataEmissao);
      const hoje = new Date();
      if (
        dataEmissao.getMonth() !== hoje.getMonth() ||
        dataEmissao.getFullYear() !== hoje.getFullYear()
      ) return;

      for (const lojaChave of Object.keys(METAS)) {
        if (loja.toLowerCase().includes(lojaChave.toLowerCase())) {
          if (!realizadoPorLoja[lojaChave]) realizadoPorLoja[lojaChave] = 0;
          realizadoPorLoja[lojaChave] += dataNota.valorNota || 0;
        }
      }
    });

    const container = document.getElementById('graficosContainer');
    container.innerHTML = '';

    Object.entries(METAS).forEach(([loja, meta]) => {
      const realizado = realizadoPorLoja[loja] || 0;
      const hoje = new Date();
      const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
      const proporcao = hoje.getDate() / diasNoMes;
      const projecao = realizado / proporcao;

      const realizadoPercent = Math.min(realizado / meta, 1);
      const projecaoPercent = Math.min(projecao / meta, 1);
      const restantePercent = Math.max(0, 1 - projecaoPercent);

      const dados = [
        realizadoPercent,
        Math.max(0, projecaoPercent - realizadoPercent),
        restantePercent
      ];

      const graficoBox = document.createElement('div');
      graficoBox.classList.add('grafico-box');

      graficoBox.innerHTML = `
        <h3>${loja.toUpperCase()}</h3>
        <canvas id="grafico-${loja.replace(/\s+/g, '-').toLowerCase()}" height="80" width="800" style="margin-bottom: 10px;"></canvas>
        <p class="meta-valor">Meta: <strong>${formatarValor(meta)}</strong></p>
      `;

      container.appendChild(graficoBox);

      if (loja !== Object.keys(METAS).slice(-1)[0]) {
        const linha = document.createElement('hr');
        linha.style.margin = '30px 0';
        linha.style.border = 'none';
        linha.style.borderTop = '1px solid #ccc';
        container.appendChild(linha);
      }

      const ctx = graficoBox.querySelector('canvas').getContext('2d');
      const isMobile = window.innerWidth <= 768;

      const datasets = [
        {
          label: 'Realizado',
          data: [dados[0]],
          backgroundColor: CORES.realizado,
          stack: 'meta'
        },
        {
          label: 'Projeção',
          data: [dados[1]],
          backgroundColor: CORES.projecao,
          stack: 'meta'
        }
      ];

      if (dados[2] > 0) {
        datasets.push({
          label: 'Restante',
          data: [dados[2]],
          backgroundColor: CORES.restante,
          stack: 'meta'
        });
      }

      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: [''],
          datasets: datasets
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: context => {
                  const valor = context.raw * meta;
                  return `${context.dataset.label}: ${formatarValor(valor)}`;
                }
              }
            },
            datalabels: {
              display: isMobile ? false : true,
              color: '#000',
              anchor: isMobile ? 'end' : 'end',
              align: isMobile ? 'start' : 'start',
              formatter: (valor, context) => {
                const label = context.dataset.label;
                const valorAbsoluto = valor * meta;
                return `${label}\n${formatarValor(valorAbsoluto)}`;
              },
              font: {
                weight: 'bold',
                size: isMobile ? 6 : 10
              },
              clamp: true,
              clip: true,
              padding: {
                right: 6
              }
            }            
          },
          scales: {
            x: {
              stacked: true,
              min: 0,
              max: 1,
              grid: { display: false, drawTicks: false, drawBorder: false },
              ticks: { display: false }
            },
            y: {
              stacked: true,
              grid: { display: false, drawTicks: false, drawBorder: false },
              ticks: { display: false }
            }
          }
        },
        plugins: [ChartDataLabels]
      });
    });
  } catch (erro) {
    console.error('Erro ao carregar dados:', erro);
  }
}

  document.getElementById('botaoRefresh')?.addEventListener('click', async (event) => {
    event.preventDefault(); // evita recarregamento da página
  
    const btn = document.getElementById('botaoRefresh');
    btn.classList.add('girando'); // inicia rotação
    console.log('[🔄 Início] Atualizando notas...');
  
    try {
      const res = await fetch('https://metas-koala.onrender.com/api/atualizar-notas');
  
      console.log(`[🌐 Status] Código da resposta: ${res.status}`);
  
      if (!res.ok) {
        const text = await res.text();
        console.warn('[⚠️ API respondeu com erro]', text.slice(0, 300));
        throw new Error('Erro ao atualizar notas');
      }
  
      const json = await res.json();
      console.log('[✅ Concluído] Resposta recebida:', json);
      alert(json.mensagem || 'Notas atualizadas com sucesso!');
    } catch (err) {
      console.error('[❌ Erro] Durante a atualização:', err);
      alert('Erro ao atualizar notas!');
    } finally {
      btn.classList.remove('girando'); // para rotação
      console.log('[✔️ Fim] Processo de atualização encerrado');
    }
  });  
  
  document.addEventListener('DOMContentLoaded', carregarDadosBarras);
  