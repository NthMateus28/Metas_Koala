const METAS = {
    'Mercado Livre RS': 166971,
    'Mercado Livre SC-FULL-Armer': 166971,
    'Mercado Livre SC-AZAudio': 166971,
    'Mercado Livre SC-FULL-Koala Music': 79547,
    'Mercado Livre SC-Koala Music': 914876,
    'Mercado Livre SP-FULL' : 79547
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
        const dados = [
          realizadoPercent,
          Math.max(0, projecaoPercent - realizadoPercent),
          Math.max(0, 1 - projecaoPercent)
        ];
        
  
        const graficoBox = document.createElement('div');
        graficoBox.classList.add('grafico-box');
  
        graficoBox.innerHTML = `
          <h3>${loja.toUpperCase()}</h3>
          <canvas id="grafico-${loja.replace(/\s+/g, '-').toLowerCase()}" height="80" width="800" style="margin-bottom: 10px;"></canvas>
`;
  
          container.appendChild(graficoBox);

          // Adiciona <hr> após cada gráfico, exceto o último
          if (loja !== Object.keys(METAS).slice(-1)[0]) {
            const linha = document.createElement('hr');
            linha.style.margin = '30px 0'; // espaço antes e depois da linha
            linha.style.border = 'none';
            linha.style.borderTop = '1px solid #ccc'; // ou outra cor
            container.appendChild(linha);
          }
            
        const ctx = graficoBox.querySelector('canvas').getContext('2d');
  
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: [''],
            datasets: [
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
              },
              {
                label: 'Restante',
                data: [dados[2]],
                backgroundColor: CORES.restante,
                stack: 'meta'
              }
            ]
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
              }
            },
            scales: {
                x: {
                  stacked: true,
                  min: 0,
                  max: 1,
                  grid: {
                    display: false,
                    drawTicks: false,
                    drawBorder: false
                  },
                  ticks: {
                    display: false
                  }
                },
                y: {
                  stacked: true,
                  grid: {
                    display: false,
                    drawTicks: false,
                    drawBorder: false
                  },
                  ticks: {
                    display: false
                  }
                }
              }
              
          }
        });
      });
    } catch (erro) {
      console.error('Erro ao carregar dados:', erro);
    }
  }
  
  document.addEventListener('DOMContentLoaded', carregarDadosBarras);
  