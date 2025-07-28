const idsValidos = [
  15102988390, 15104227133, 15104022626, 15102988260, 15103180033,
  15103323507, 15106965891, 14316562699, 15101996841, 15103135847,
  15102988191, 15104300347, 15102642266, 14316243535, 15102242030,
  14316243464, 15103136599, 15101873294, 15107363711, 15103131838,
  15105999702, 15105613261
];

const meta = 2500000;
const hoje = new Date();
const mesAtual = hoje.getMonth();
const anoAtual = hoje.getFullYear();
const ultimoDiaDoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
const primeiroDia = new Date(anoAtual, mesAtual, 1);

async function buscarNotas() {
  const dataInicial = `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-01`;
  const dataFinal = `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const url = `http://localhost:3000/api/nfe?inicio=${dataInicial}&fim=${dataFinal}`;

  try {
    const response = await fetch(url);
    const result = await response.json();
    const notas = result.data || [];

    const notasFiltradas = notas.filter(nf => {
      const dataEmissao = new Date(nf.dataEmissao);
      return (
        dataEmissao.getFullYear() === anoAtual &&
        dataEmissao.getMonth() === mesAtual &&
        dataEmissao.getDate() >= 1 &&
        dataEmissao.getDate() <= hoje.getDate() &&
        idsValidos.includes(nf.naturezaOperacao?.id)
      );
    });

    const detalhesCacheados = await fetch('http://localhost:3000/api/nfe-cache')
      .then(res => res.json())
      .catch(() => ({}));

    const idsRestantes = [];
    const detalhesNotas = [];

    for (const nf of notasFiltradas) {
      if (detalhesCacheados[nf.id]) {
        detalhesNotas.push(detalhesCacheados[nf.id]);
      } else {
        idsRestantes.push(nf.id);
      }
    }

    const novosDetalhes = await buscarDetalhesComLimite(idsRestantes, 5);

    // Atualiza o cache no servidor com as novas
    if (novosDetalhes.length > 0) {
      await fetch('http://localhost:3000/api/nfe-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novosDetalhes)
      });
    }

    const todosDetalhes = [...detalhesNotas, ...novosDetalhes];
    const realizado = todosDetalhes.reduce((soma, detalhe) => soma + (detalhe?.data?.valorNota || 0), 0);
    const proporcao = hoje.getDate() / ultimoDiaDoMes;
    const projetado = realizado / proporcao;

    renderizarGrafico(realizado, projetado);
  } catch (err) {
    console.error('❌ Erro ao buscar notas:', err);
  }
}

async function buscarDetalhesComLimite(ids, limite = 5) {
  const resultados = [];
  let i = 0;

  async function processarProxima() {
    if (i >= ids.length) return;

    const id = ids[i++];
    const detalhe = await tentarBuscarNotaComRetry(id, 5);
    if (detalhe) resultados.push(detalhe);

    await new Promise(resolve => setTimeout(resolve, 3000));
    return processarProxima();
  }

  const workers = Array.from({ length: limite }, processarProxima);
  await Promise.all(workers);
  return resultados;
}

async function tentarBuscarNotaComRetry(id, tentativas) {
  let tentativaAtual = 0;

  while (tentativaAtual < tentativas) {
    try {
      const response = await fetch(`http://localhost:3000/api/nfe/${id}`);
      if (response.ok) {
        return await response.json();
      } else if (response.status === 429) {
        console.warn(`⚠️ Tentativa ${tentativaAtual + 1} falhou com 429. Aguardando 5 segundos...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.warn(`⚠️ Erro ao buscar nota ${id}: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Erro ao buscar nota ${id} (tentativa ${tentativaAtual + 1}):`, error);
    }
    tentativaAtual++;
  }

  console.warn(`⚠️ Todas as ${tentativas} tentativas falharam para nota ${id}`);
  return null;
}

Chart.register({
  id: 'centerText',
  beforeDraw(chart) {
    const { width, height } = chart;
    const ctx = chart.ctx;
    const pluginOpts = chart.config.options.plugins.centerText;
    if (!pluginOpts) return;

    const { realizado, projetado, meta } = pluginOpts;

    const porcentagemProjecao = Math.min(100, Math.round((projetado / meta) * 100));
    const textoRealizado = `R$ ${realizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const textoProjecao = `${porcentagemProjecao}%`;

    ctx.save();
    ctx.textAlign = 'center';

    // Projeção (menor, acima)
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#3498db';
    ctx.fillText(textoProjecao, width / 2, height / 2 - 10);

    // Realizado (maior, abaixo)
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#2c3e50';
    ctx.fillText(textoRealizado, width / 2, height / 2 + 15);

    ctx.restore();
  }
});


function renderizarGrafico(realizado, projetado) {
  const ctx = document.getElementById('chartRealizado').getContext('2d');

  const realizadoPercentual = Math.min(realizado / meta, 1);
  const projetadoPercentual = Math.min(projetado / meta, 1);

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Realizado', 'Projeção', 'Restante'],
      datasets: [{
        data: [
          realizadoPercentual * 100,
          (projetadoPercentual - realizadoPercentual) * 100,
          Math.max(0, 100 - projetadoPercentual * 100)
        ],
        backgroundColor: ['#2ecc71', 'rgba(52, 152, 219, 0.5)', '#ecf0f1'],
        borderWidth: 0
      }]
    },
    options: {
      circumference: 180,         // 🔽 Metade do círculo (180 graus)
      rotation: 270,              // 🔁 Começa de baixo (posição de 6h no relógio)
      cutout: '70%',              // 🔘 Varia a espessura do gráfico
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const label = ctx.label || '';
              const valor = ctx.raw;
              return `${label}: ${valor.toFixed(1)}%`;
            }
          }
        },
        title: {
          display: true,
          text: `Realizado: R$ ${realizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • Projeção: R$ ${projetado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          font: { size: 14 }
        }
      }
    }
  });
}




buscarNotas();
